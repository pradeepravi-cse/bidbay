# BidBay — Developer Guide

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 20 | Runtime |
| pnpm | ≥ 9 | Package manager |
| PostgreSQL | ≥ 14 | Database (one per service) |
| Kafka | ≥ 3.x | Message broker |
| NX CLI | (via pnpm) | Monorepo task runner |

---

## Repository Structure

```
bidbay-monorepo/
├── api/
│   ├── api-gateway/          # HTTP gateway (port 3000)
│   │   └── src/
│   │       ├── app/          # AppModule, health check, logger
│   │       ├── orders/       # Orders proxy (controller + service + DTOs)
│   │       ├── inventory/    # Inventory proxy (controller + service + DTOs)
│   │       ├── middleware/   # TraceIdMiddleware
│   │       └── interceptors/ # LoggerInterceptor
│   │
│   ├── order-service/        # Order domain (port 3001)
│   │   └── src/
│   │       ├── app/          # AppModule, AppController, main.ts
│   │       ├── commands/     # PlaceOrderCommand + handler
│   │       ├── queries/      # GetOrderById, GetOrdersByUser + handlers
│   │       ├── consumers/    # InventoryEventsConsumer (Kafka)
│   │       ├── outbox/       # OutboxPollerService (@Cron)
│   │       ├── repositories/ # OrderRepository, OutboxRepository, InboxRepository
│   │       ├── entities/     # Order, OrderOutbox, OrderInbox
│   │       └── dto/          # PlaceOrderDto, ListOrdersQueryDto
│   │
│   ├── inventory-service/    # Inventory domain (port 3002)
│   │   └── src/
│   │       ├── app/          # AppModule, AppController, main.ts
│   │       ├── commands/     # CreateInventory, UpdateInventory + handlers
│   │       ├── queries/      # GetAllInventory, GetInventoryBySku + handlers
│   │       ├── consumers/    # OrderEventsConsumer (Kafka)
│   │       ├── outbox/       # OutboxPollerService (@Cron)
│   │       ├── repositories/ # InventoryRepository, OutboxRepository, InboxRepository
│   │       ├── entities/     # Inventory, InventoryOutbox, InventoryInbox
│   │       └── dto/          # CreateInventoryDto, UpdateInventoryDto
│   │
│   ├── api-gateway-e2e/      # E2E tests for gateway
│   ├── order-service-e2e/    # E2E tests for order service
│   └── inventory-service-e2e/
│
├── docs/                     # Documentation
├── .env                      # Environment variables (not committed to prod)
├── package.json              # Root dependencies (shared by all services)
├── pnpm-workspace.yaml       # pnpm workspace config
├── nx.json                   # NX build system config
└── tsconfig.base.json        # Shared TypeScript paths
```

---

## Initial Setup

### 1. Install Dependencies

```bash
pnpm install
```

All services share the root `package.json`. No `npm install` is needed per-service.

### 2. Configure Environment

Copy `.env` or create one at the repo root:

```env
# Databases
DB_HOST=localhost
DB_PORT=5432
DB_USER=admin
DB_PASS=P@ssword1

# Order Service
ORDER_SERVICE_PORT=3001
ORDER_DB_NAME=order_service

# Inventory Service
INVENTORY_SERVICE_PORT=3002
INVENTORY_DB_NAME=inventory_service

# Kafka
KAFKA_BROKERS=localhost:9092
```

### 3. Create Databases

```bash
psql -U admin -c "CREATE DATABASE order_service;"
psql -U admin -c "CREATE DATABASE inventory_service;"
```

Schemas are created automatically on first run (`synchronize: true` in development).

### 4. Start Kafka

Kafka must be reachable at the broker address in `.env`. Using Docker:

```bash
docker run -d --name kafka \
  -p 9092:9092 \
  -e KAFKA_CFG_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
  bitnami/kafka:latest
```

---

## Running Services

### Development (all services)

```bash
# Run each in a separate terminal
pnpm nx serve api-gateway
pnpm nx serve order-service
pnpm nx serve inventory-service
```

Or using NX's run-many:

```bash
pnpm nx run-many -t serve --parallel
```

### Port Summary

| Service | Port |
|---------|------|
| API Gateway | 3000 |
| Order Service | 3001 |
| Inventory Service | 3002 |

---

## Quick Smoke Test

```bash
# 1. Create inventory
curl -X POST http://localhost:3000/api/inventory \
  -H "Content-Type: application/json" \
  -d '{"sku":"WIDGET-A","availableQty":100}'

# 2. Place an order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "items": [{"sku":"WIDGET-A","quantity":2,"price":19.99}]
  }'
# Returns: {"orderId":"...","status":"PENDING","totalAmount":"39.98","createdAt":"..."}

# 3. Poll order status (wait ~5s for SAGA to complete)
curl http://localhost:3000/api/orders/<orderId>
# Returns: {"status":"CONFIRMED",...}

# 4. Check inventory was updated
curl http://localhost:3000/api/inventory/WIDGET-A
# Returns: {"availableQty":98,"reservedQty":2,...}
```

---

## Building for Production

```bash
pnpm nx build api-gateway
pnpm nx build order-service
pnpm nx build inventory-service
```

Outputs land in `dist/api/<service>/`. Run with:

```bash
node dist/api/order-service/main.js
```

---

## Running Tests

```bash
# All services
pnpm nx run-many -t test

# Single service
pnpm nx test order-service
pnpm nx test inventory-service
pnpm nx test api-gateway

# E2E
pnpm nx e2e order-service-e2e
```

---

## Adding a New Feature

### Adding a Command (write operation)

Example: adding `CancelOrderCommand` to Order Service.

**1. Create the command class** — `src/commands/cancel-order.command.ts`
```typescript
export class CancelOrderCommand {
  constructor(public readonly orderId: string, public readonly reason: string) {}
}
```

**2. Create the handler** — `src/commands/handlers/cancel-order.handler.ts`
```typescript
@CommandHandler(CancelOrderCommand)
export class CancelOrderHandler implements ICommandHandler<CancelOrderCommand> {
  constructor(private readonly dataSource: DataSource) {}

  async execute(command: CancelOrderCommand): Promise<void> {
    const { orderId, reason } = command;
    await this.dataSource.transaction(async (em) => {
      await em.update(Order, { id: orderId }, { status: 'CANCELLED', failureReason: reason });
    });
  }
}
```

**3. Register the handler in AppModule**
```typescript
providers: [CancelOrderHandler, ...]
```

**4. Add the route in AppController**
```typescript
@Delete(':orderId')
async cancelOrder(@Param('orderId') id: string, @Body() dto: CancelOrderDto) {
  await this.commandBus.execute(new CancelOrderCommand(id, dto.reason));
}
```

### Adding a Query (read operation)

**1. Create the query** — `src/queries/get-order-stats.query.ts`
```typescript
export class GetOrderStatsQuery {
  constructor(public readonly userId: string) {}
}
```

**2. Create the handler** — `src/queries/handlers/get-order-stats.handler.ts`
```typescript
@QueryHandler(GetOrderStatsQuery)
export class GetOrderStatsHandler implements IQueryHandler<GetOrderStatsQuery> {
  constructor(private readonly orderRepo: OrderRepository) {}

  async execute(query: GetOrderStatsQuery) {
    return this.orderRepo.getStatsByUser(query.userId);
  }
}
```

**3. Register and add route** — same pattern as commands above.

### Adding a New Kafka Event

If Order Service needs to emit a new event (e.g., `order.cancelled`):

**1. Write to outbox inside the handler transaction:**
```typescript
await em.save(OrderOutbox, {
  aggregateId: order.id,
  aggregateType: 'Order',
  eventType: 'order.cancelled',
  payload: { orderId: order.id, reason },
  status: 'UNSENT',
  retryCount: 0,
});
```

The outbox poller automatically picks it up — no other changes needed.

**2. Add the consumer in the other service** (if another service should react):
```typescript
@MessagePattern('order.cancelled')
async handleOrderCancelled(@Payload() data: any, @Ctx() ctx: KafkaContext) {
  const eventId = ctx.getMessage().headers['event-id']?.toString();
  // inbox guard + business logic
}
```

---

## Module Anatomy

### AppModule (Order Service)

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRootAsync(...),      // Pino logger
    TypeOrmModule.forRootAsync(...),     // PostgreSQL connection
    TypeOrmModule.forFeature([...]),     // Entity registration
    CqrsModule,                          // CommandBus + QueryBus
    ScheduleModule.forRoot(),            // @Cron support
    ClientsModule.registerAsync([...]),  // Kafka producer client
  ],
  controllers: [AppController],
  providers: [
    // Command handlers
    PlaceOrderHandler,
    // Query handlers
    GetOrderByIdHandler, GetOrdersByUserHandler,
    // Kafka consumer
    InventoryEventsConsumer,
    // Outbox poller
    OutboxPollerService,
    // Repositories
    OrderRepository, OutboxRepository, InboxRepository,
  ],
})
export class AppModule {}
```

### main.ts (Hybrid App Pattern)

Both Order Service and Inventory Service run as **hybrid apps** — they serve HTTP _and_ consume Kafka in the same process:

```typescript
const app = await NestFactory.create(AppModule, { bufferLogs: true });

// Attach Kafka microservice transport
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.KAFKA,
  options: {
    client: { brokers: [process.env.KAFKA_BROKERS] },
    consumer: { groupId: 'order-service' },
  },
});

await app.startAllMicroservices();  // Start Kafka consumer
await app.listen(3001);             // Start HTTP server
```

---

## Environment Variables Reference

| Variable | Default | Used By |
|----------|---------|---------|
| `DB_HOST` | `192.168.0.115` | Order Service, Inventory Service |
| `DB_PORT` | `5432` | Order Service, Inventory Service |
| `DB_USER` | `admin` | Order Service, Inventory Service |
| `DB_PASS` | `P@ssword1` | Order Service, Inventory Service |
| `ORDER_SERVICE_PORT` | `3001` | Order Service |
| `ORDER_DB_NAME` | `order_service` | Order Service |
| `INVENTORY_SERVICE_PORT` | `3002` | Inventory Service |
| `INVENTORY_DB_NAME` | `inventory_service` | Inventory Service |
| `KAFKA_BROKERS` | `192.168.0.115:9092` | Order Service, Inventory Service |

---

## Logging

All services use **Pino** via `nestjs-pino`. Log output is structured JSON.

Logs include:
- `traceId` — from `x-trace-id` header, propagated end-to-end
- `path` — HTTP path
- `statusCode` — response status
- `duration` — response time in ms
- `service` — service name

In development, pretty-print with:

```bash
node dist/api/order-service/main.js | pino-pretty
```

---

## Observability (Internal Endpoints)

The outbox and inbox tables are observable directly via the database. They are **not exposed** via the API Gateway as per the TDD spec.

Useful queries:

```sql
-- Stuck outbox events
SELECT * FROM outbox WHERE status = 'UNSENT' AND retry_count >= 5;

-- Recent inbox duplicates
SELECT event_id, COUNT(*) FROM order_inbox GROUP BY event_id HAVING COUNT(*) > 1;

-- Order status distribution
SELECT status, COUNT(*) FROM orders GROUP BY status;
```

---

## Common Issues

### Kafka consumer not receiving messages

- Check `KAFKA_BROKERS` is reachable from your machine
- Ensure the topic exists (Kafka auto-creates by default if `auto.create.topics.enable=true`)
- Verify consumer `groupId` matches — if changed, the consumer starts from the latest offset

### Orders stuck in PENDING

The SAGA pipeline: outbox poller → Kafka → inventory consumer → inventory outbox poller → Kafka → order consumer.

Check in order:
1. Is the outbox row `SENT`? If `UNSENT`, the poller may not be running.
2. Is the inventory inbox row `PROCESSED`? If `UNPROCESSED`, check Kafka consumer logs.
3. Is the inventory outbox row `SENT`?
4. Is the order inbox row `PROCESSED`?

### TypeORM `synchronize: true` warnings in production

`synchronize: true` is only safe in development. For production, disable it and use TypeORM migrations:

```bash
pnpm typeorm migration:generate -n AddFailureReason
pnpm typeorm migration:run
```

### Duplicate key on inbox INSERT

This is expected behavior — it means a duplicate Kafka message was received and correctly deduplicated. Not an error.

---

## Code Conventions

| Convention | Rule |
|-----------|------|
| Controllers | Thin — only dispatch to CommandBus/QueryBus, no business logic |
| Handlers | Own all business logic, use DataSource for transactions |
| Repositories | Thin query abstractions — no business logic |
| DTOs | Use class-validator decorators, no optional fields without defaults |
| Transactions | Always use `dataSource.transaction(async (em) => ...)` for multi-table writes |
| Outbox | Always write command + outbox in the same transaction |
| Inbox | Always call `tryInsert()` before processing; skip if false |

---

## Adding a New Service

1. Generate with NX:
   ```bash
   pnpm nx generate @nx/nest:application my-new-service
   ```

2. Follow the same structure as `order-service`:
   - Hybrid app (`connectMicroservice` + `listen`)
   - CQRS for all operations
   - Outbox + Inbox for Kafka reliability
   - Separate PostgreSQL database

3. Add proxy routes to API Gateway:
   - New `src/<domain>/` folder in `api-gateway`
   - New `HttpModule` with `baseURL` pointing to the new service
   - Register in `AppModule`

4. Add environment variable for port and DB name in `.env`
