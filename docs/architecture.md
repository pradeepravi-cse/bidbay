# BidBay — Architecture Overview

## What Is BidBay?

BidBay is an auction and bidding platform being built as a cloud-native, event-driven microservices system. The current implementation covers the Order and Inventory domains — the transactional core of any e-commerce or auction platform.

---

## High-Level System Diagram

```
                            ┌─────────────────────────────────────┐
                            │           Clients / UIs              │
                            └──────────────┬──────────────────────┘
                                           │ HTTP
                                           ▼
                            ┌─────────────────────────────────────┐
                            │          API Gateway :3000           │
                            │  ┌────────────┐  ┌───────────────┐  │
                            │  │  /orders   │  │  /inventory   │  │
                            │  └─────┬──────┘  └───────┬───────┘  │
                            └────────┼─────────────────┼──────────┘
                                     │ HTTP proxy       │ HTTP proxy
                          ┌──────────▼──┐          ┌───▼──────────┐
                          │  Order Svc  │          │ Inventory Svc │
                          │   :3001     │          │    :3002      │
                          │  (Postgres) │          │  (Postgres)   │
                          └──────┬──────┘          └──────┬────────┘
                                 │                        │
                                 │    ┌───────────┐       │
                                 └───►│   Kafka   │◄──────┘
                                      └───────────┘
```

---

## Services

### API Gateway (port 3000)

The single HTTP entry point for all clients. It does **not** contain business logic — it validates requests, attaches trace IDs, and proxies to downstream services over HTTP.

| Route | Forwarded To |
|-------|-------------|
| `POST /api/orders` | Order Service |
| `GET /api/orders` | Order Service |
| `GET /api/orders/:id` | Order Service |
| `POST /api/inventory` | Inventory Service |
| `PATCH /api/inventory/:sku` | Inventory Service |
| `GET /api/inventory` | Inventory Service |
| `GET /api/inventory/:sku` | Inventory Service |

**Responsibilities:**
- Input validation via `ValidationPipe` (class-validator DTOs)
- Trace ID propagation (`x-trace-id` header — generated if absent)
- Structured request/response logging via Pino
- HTTP error mapping (Axios errors → NestJS `HttpException`)

### Order Service (port 3001)

Manages the full lifecycle of an order. It exposes HTTP endpoints (consumed by the gateway) and runs a Kafka consumer in the same process.

**HTTP endpoints:**
- `POST /orders` — Creates order with status `PENDING`, returns `202 Accepted`
- `GET /orders/:orderId` — Fetch order by ID
- `GET /orders?userId=&status=&page=&limit=` — Paginated order list

**What happens when an order is placed:**
1. Calculate `totalAmount` = Σ(quantity × price)
2. In a single DB transaction: insert `Order` row + insert `Outbox` row
3. Return `202` immediately (async processing continues)
4. Outbox poller picks up the row, publishes `order.created` to Kafka
5. Kafka consumer later updates the order to `CONFIRMED` or `CANCELLED`

### Inventory Service (port 3002)

Manages stock levels per SKU. Exposes HTTP for direct inventory management and runs a Kafka consumer to react to orders.

**HTTP endpoints:**
- `POST /inventory` — Register a new SKU with available quantity
- `PATCH /inventory/:sku` — Update available quantity for a SKU
- `GET /inventory` — List all SKUs
- `GET /inventory/:sku` — Get one SKU

**What happens when an order arrives (via Kafka):**
1. Deduplication check via Inbox table
2. Lock the relevant inventory rows (`FOR UPDATE SKIP LOCKED`)
3. Check if all requested SKUs have sufficient `availableQty`
4. **Happy path:** reduce `availableQty`, increase `reservedQty`, write `inventory.reserved` to outbox
5. **Failure path:** write `inventory.failed` to outbox with reason
6. Outbox poller publishes the result to Kafka

---

## The SAGA: Order → Inventory → Order

This is **SAGA choreography** — there is no central orchestrator. Each service reacts to events published by others.

```
1. Client POST /api/orders
        │
        ▼
2. Order Service: INSERT order (PENDING) + INSERT outbox row
   → returns 202 immediately
        │
        ▼
3. Order Outbox Poller (every 2s):
   → EMIT "order.created" to Kafka
        │
        ▼
4. Inventory Service consumes "order.created":
   → Lock inventory rows
   → Check stock
   ┌───────────────────────────────┐
   │ Sufficient stock?             │
   │  YES → reserve + outbox row  │ → EMIT "inventory.reserved"
   │  NO  → outbox row (failed)   │ → EMIT "inventory.failed"
   └───────────────────────────────┘
        │
        ▼
5. Order Service consumes event:
   → "inventory.reserved"  → UPDATE order SET status = CONFIRMED
   → "inventory.failed"    → UPDATE order SET status = CANCELLED
```

### Kafka Topics & Consumer Groups

| Topic | Producer | Consumer | Consumer Group | Meaning |
|-------|----------|----------|----------------|---------|
| `order.created` | Order Service | Inventory Service | `inventory-service` | New order placed |
| `inventory.reserved` | Inventory Service | Order Service | `order-service` | Stock successfully reserved |
| `inventory.failed` | Inventory Service | Order Service | `order-service` | Insufficient stock |

**Producer clientIds**: `order-service-producer`, `inventory-service-producer`
**Consumer clientIds**: `order-service-consumer`, `inventory-service-consumer`

---

## Key Patterns

### Outbox Pattern

Publishing to Kafka directly from a request handler is unsafe — if the service crashes after the DB commit but before the Kafka send, the event is lost. The outbox solves this:

```
Request Handler (single transaction):
  ┌──────────────────────────────────┐
  │  INSERT order (status=PENDING)   │
  │  INSERT outbox (status=UNSENT)   │
  └──────────────────────────────────┘
         ↓ (asynchronously, every 2s)
  Outbox Poller:
    -- Order Service: SELECT * FROM outbox WHERE status='UNSENT' FOR UPDATE SKIP LOCKED
  -- Inventory Service: SELECT * FROM inventory_outbox WHERE status='UNSENT' FOR UPDATE SKIP LOCKED
    → send to Kafka
    → UPDATE outbox SET status='SENT'
```

If the poller crashes mid-send, the row remains `UNSENT` and will be retried. Maximum 5 retries before marking `FAILED`.

### Inbox Pattern (Idempotency Guard)

Kafka guarantees **at-least-once delivery** — the same event can arrive more than once. The inbox prevents double-processing:

```
Consumer receives event:
  INSERT INTO inbox (event_id, ...) ON CONFLICT DO NOTHING
  → rows affected = 0? → duplicate, skip
  → rows affected = 1? → new, process
```

The `eventId` comes from the Kafka message header (`event-id`) which is set to the outbox row's UUID — stable across retries.

### CQRS (Command Query Responsibility Segregation)

Write operations use `CommandBus`, reads use `QueryBus`. Controllers are thin dispatchers:

```typescript
// Write
@Post()
async placeOrder(@Body() dto: PlaceOrderDto) {
  return this.commandBus.execute(new PlaceOrderCommand(dto.userId, dto.items));
}

// Read
@Get(':orderId')
async getOrder(@Param('orderId') id: string) {
  return this.queryBus.execute(new GetOrderByIdQuery(id));
}
```

This keeps controllers free of business logic and makes handlers independently testable.

### FOR UPDATE SKIP LOCKED

Prevents overselling when multiple pods process orders concurrently:

- Pod A processes order-1, locks SKU-X row
- Pod B processes order-2, tries to lock SKU-X — skipped (waits for next poll)
- Pod A commits, releases lock
- Pod B retries and gets the lock

This ensures two concurrent orders never both see "stock available" for the same units.

---

## Data Model

### Order Service — Tables

**orders**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | varchar | Owner |
| items | JSONB | `[{sku, quantity, price}]` |
| total_amount | decimal(10,2) | Calculated at placement |
| status | enum | `PENDING` → `CONFIRMED` or `CANCELLED` |
| failure_reason | varchar | Set on cancellation |
| created_at | timestamp | |
| updated_at | timestamp | |

**outbox** ← actual DB table name (TypeScript entity: `Outbox`, `@Entity('outbox')`)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key, used as Kafka event-id header |
| aggregate_id | varchar | orderId |
| aggregate_type | varchar | `'Order'` |
| event_type | varchar | `'order.created'` |
| payload | JSONB | Full event payload |
| status | enum | `UNSENT` → `SENT` / `FAILED` |
| retry_count | int | Max 5 retries before permanently `FAILED` |
| created_at | timestamp | |
| sent_at | timestamp | Set on success |

**order_inbox**
| Column | Type | Notes |
|--------|------|-------|
| event_id | UUID | Primary key (dedup guard) |
| topic | varchar | `'inventory.reserved'` / `'inventory.failed'` |
| event_type | varchar | |
| status | enum | `UNPROCESSED` → `PROCESSED` / `FAILED` |
| failure_reason | varchar | |
| received_at | timestamp | |
| processed_at | timestamp | |

### Inventory Service — Tables

**inventory**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| sku | varchar | Unique |
| available_qty | int | Currently available |
| reserved_qty | int | Held for pending orders |
| version | int | Optimistic lock version |
| updated_at | timestamp | |

**inventory_outbox** — same column schema as **outbox** above; DB table name is `inventory_outbox` (`@Entity('inventory_outbox')`)
- event_type values: `inventory.reserved` | `inventory.failed`

**inventory_inbox** — same column schema as **order_inbox**; DB table name is `inventory_inbox` (`@Entity('inventory_inbox')`)
- topic: `order.created`

> **Column naming note**: TypeORM converts camelCase TypeScript property names to snake_case in PostgreSQL (e.g., `aggregateId` → `aggregate_id`, `retryCount` → `retry_count`).

---

## Technology Choices

| Concern | Technology | Rationale |
|---------|-----------|-----------|
| Framework | NestJS 11 | DI, decorators, modular; good fit for microservices |
| ORM | TypeORM | Native TS support, works well with NestJS |
| Message broker | Kafka | Durable, partitioned, high-throughput |
| Database | PostgreSQL | ACID transactions needed for outbox/inbox |
| Monorepo | NX + pnpm | Shared deps, consistent tooling |
| Logging | Pino | Structured JSON, high performance |
| Validation | class-validator | Declarative, integrates with NestJS pipes |

---

## What Is Not Yet Implemented

The BRD (`docs/BRD.md`) describes the full vision. The following services are planned but not implemented:

- User Service
- Auction Service
- Bidding Service
- Payment Service
- Notification Service
- Search Service
- Reporting Service
- Admin Panel Service
