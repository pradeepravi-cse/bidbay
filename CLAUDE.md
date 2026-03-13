# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Role & Standards

Act as a **senior full-stack engineer and application architect** across all work in this repo. That means:

- Apply production-grade design principles: SOLID, DRY, separation of concerns, fail-fast, least privilege.
- Flag security concerns proactively (OWASP Top 10, injection, XSS, broken auth, insecure deserialization).
- Prefer explicit, auditable code over "clever" abstractions.
- Design for observability: every operation must be traceable, measurable, and debuggable in production.
- Think about scaling and operational reliability before writing code (idempotency, retry semantics, at-least-once vs exactly-once).

---

## Commands

```bash
# Install (all services share root package.json)
pnpm install

# Serve — run each in a separate terminal
pnpm nx serve api-gateway
pnpm nx serve order-service
pnpm nx serve inventory-service

# Run all services in parallel
pnpm nx run-many -t serve --parallel

# Test
pnpm nx test order-service              # single service
pnpm nx test inventory-service
pnpm nx test api-gateway
pnpm nx run-many -t test                # all services
pnpm nx test order-service --coverage   # with coverage report

# Build
pnpm nx build order-service
pnpm nx build inventory-service
pnpm nx build api-gateway
pnpm nx run-many --target=build --projects=order-service,inventory-service,api-gateway

# Lint
pnpm nx lint order-service
pnpm nx run-many -t lint

# CRITICAL — reset NX cache after editing libs/audit or libs/logger:
pnpm nx reset && pnpm nx run-many --target=build --projects=order-service,inventory-service,api-gateway

# Run production build
node dist/api/order-service/main.js | pino-pretty   # human-readable logs in dev
```

---

## Repository Structure

```
bidbay-monorepo/
├── api/
│   ├── api-gateway/          Port 3000 — HTTP entry point, proxies to microservices
│   ├── order-service/        Port 3001 — Order domain, hybrid HTTP + Kafka
│   ├── inventory-service/    Port 3002 — Inventory domain, hybrid HTTP + Kafka
│   ├── api-gateway-e2e/
│   ├── order-service-e2e/
│   └── inventory-service-e2e/
├── libs/
│   ├── audit/                @bidbay/audit — HTTP + entity-level audit trail
│   └── logger/               @bidbay/logger — Pino structured logging + trace context
├── docs/                     Architecture, BRD, API contracts, developer guide
├── .env                      Environment variables (single file at repo root)
├── package.json              Root dependencies shared by all services
├── pnpm-workspace.yaml       pnpm workspace (api/* packages only; libs via TS paths)
├── nx.json                   NX build system config
└── tsconfig.base.json        Shared TS compiler options + path aliases
```

> `libs/` are **not** pnpm workspace packages. They are consumed exclusively via TypeScript path aliases (`@bidbay/audit`, `@bidbay/logger`). The `pnpm-workspace.yaml` only covers `api/*`.

---

## Architecture Overview

### Services & Communication

```
Client
  │
  ▼
API Gateway (3000)   ← HTTP only, ValidationPipe, TraceId, Audit (HTTP-only)
  │    │
  │    └── HttpModule (@nestjs/axios) ──► Order Service (3001)
  │                                       Inventory Service (3002)
  │
  └── x-trace-id header propagated to downstream services

Order Service (3001) ──── Kafka ────► Inventory Service (3002)
                       order.created
Inventory Service (3002) ─ Kafka ──► Order Service (3001)
                       inventory.reserved / inventory.failed
```

- **Gateway → Microservices**: HTTP proxy via `@nestjs/axios`. No TCP `ClientsModule`. The gateway does not talk to Kafka directly.
- **Microservices ↔ Kafka**: SAGA choreography (no orchestrator). Each service reacts to events.
- **Hybrid app pattern**: Both microservices call `app.connectMicroservice(kafka)` + `app.listen(http)` in the same process.

### CQRS Pattern

Controllers are thin dispatchers only — no business logic.

```
Controller
  ├── POST   → CommandBus.execute(new XyzCommand(...))   returns 202/201
  └── GET    → QueryBus.execute(new XyzQuery(...))       returns 200/404
```

Handlers own all business logic. Repositories are thin query abstractions only — no business rules.

### SAGA Choreography (Transactional Outbox + Inbox)

```
PlaceOrderHandler
  └─ transaction:
       INSERT orders (status=PENDING)
       INSERT outbox (status=UNSENT, eventType='order.created')    -- table name: 'outbox'

OutboxPollerService (@Cron every 2s)
  └─ FOR UPDATE SKIP LOCKED (batch=10)
       kafkaClient.emit('order.created', payload)
       markSent | markFailed (retry ≤5, then FAILED)

OrderEventsConsumer (Inventory Service)
  └─ @EventPattern('order.created')
       tryInsert(eventId) → skip if duplicate
       transaction:
         check stock for all items
         if ok  → availableQty -= qty, reservedQty += qty
                  INSERT inventory_outbox (inventory.reserved)
         if not → INSERT inventory_outbox (inventory.failed)
         markInboxProcessed

InventoryEventsConsumer (Order Service)
  └─ @EventPattern('inventory.reserved')   → status = CONFIRMED
     @EventPattern('inventory.failed')     → status = CANCELLED, failureReason
```

**Idempotency**: `eventId` (Kafka `event-id` header = outbox row UUID) is the primary key of inbox tables. Duplicate delivery is silently skipped via a `tryInsert` that catches UNIQUE violations.

**Concurrency safety**: `FOR UPDATE SKIP LOCKED` in the outbox poller prevents multiple pods from publishing the same event. Inventory uses optimistic locking (`@VersionColumn`) on the `Inventory` entity.

---

## Data Models

### Order Service Database (`order_service`)

**`orders`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| userId | varchar | |
| items | jsonb | `[{sku, quantity, price}]` |
| totalAmount | decimal(10,2) | |
| status | enum | PENDING · CONFIRMED · CANCELLED |
| failureReason | text | nullable |
| createdAt, updatedAt | timestamp | |

**`outbox`** ← actual DB table name (`@Entity('outbox')` in order-outbox.entity.ts)
| Column (DB snake_case) | TypeScript property | Type | Notes |
|------------------------|---------------------|------|-------|
| id | id | UUID PK | becomes Kafka `event-id` header |
| aggregate_id | aggregateId | varchar | orderId |
| aggregate_type | aggregateType | varchar | 'Order' |
| event_type | eventType | varchar | 'order.created' |
| payload | payload | jsonb | |
| status | status | enum | UNSENT · SENT · FAILED |
| retry_count | retryCount | int | FAILED after 5 attempts |
| created_at / sent_at | createdAt / sentAt | timestamp | |

**`order_inbox`**
| Column | Type | Notes |
|--------|------|-------|
| eventId | UUID PK | Kafka `event-id` header — dedup key |
| topic | varchar | |
| eventType | varchar | |
| status | enum | UNPROCESSED · PROCESSED · FAILED |
| failureReason | text | nullable |
| receivedAt, processedAt | timestamp | |

**`audit_logs`** (shared entity from `@bidbay/audit`)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| service | varchar | emitting service name |
| traceId | varchar | nullable |
| userId | varchar | from `x-user-id` header |
| level | enum | HTTP · ENTITY |
| action | enum | CREATE · READ · UPDATE · DELETE · QUERY |
| outcome | enum | SUCCESS · FAILURE · ERROR |
| httpMethod, httpPath, httpStatusCode, durationMs | — | HTTP level |
| entityType, entityId, beforeState, afterState, diff | jsonb | ENTITY level |
| requestBody, requestQuery | jsonb | sensitive fields redacted |
| ipAddress, userAgent | varchar | |
| errorMessage | text | nullable |
| createdAt | timestamp | Indexes on (userId+createdAt), (entityType+entityId), (traceId) |

### Inventory Service Database (`inventory_service`)

**`inventory`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| sku | varchar | UNIQUE |
| availableQty | int | decremented on reservation |
| reservedQty | int | incremented on reservation (default 0) |
| version | int | `@VersionColumn` — optimistic lock |
| updatedAt | timestamp | |
> `totalQty` is a computed getter: `availableQty + reservedQty`

**`inventory_outbox`** — same column schema as `outbox` above; table name is `inventory_outbox` (`@Entity('inventory_outbox')`)
- eventTypes: `inventory.reserved`, `inventory.failed`

**`inventory_inbox`** — same column schema as `order_inbox`; table name is `inventory_inbox` (`@Entity('inventory_inbox')`)
- topics: `order.created`

> **Column naming**: TypeORM automatically converts camelCase TypeScript property names to snake_case DB column names. All tables above follow this convention (e.g., `userId` → `user_id`, `aggregateId` → `aggregate_id`).

> **Kafka clientIds**: Order Service producer = `'order-service-producer'`, Inventory Service producer = `'inventory-service-producer'`. Consumer clientIds = `'order-service-consumer'` / `'inventory-service-consumer'`.

---

## Shared Libraries

### `@bidbay/audit` — `libs/audit/src/`

`AuditModule.forService(serviceName, options?)`

| Option | Gateway | Microservices |
|--------|---------|---------------|
| `persistToDb` | `false` | `true` (default) |
| `EntityAuditSubscriber` | ✗ | ✓ TypeORM global subscriber |
| `AuditLog` TypeORM entity | ✗ | ✓ added to entities[] |
| `HttpAuditInterceptor` | ✓ APP_INTERCEPTOR | ✓ APP_INTERCEPTOR |

**Critical DI rule**: `AuditService`, `HttpAuditInterceptor`, `EntityAuditSubscriber` have **zero NestJS decorators** (`@Injectable`, `@Inject`, `@InjectRepository`). They are constructed exclusively via `useFactory` in `AuditModule`. Any decorator causes TypeScript to emit `design:paramtypes` metadata which breaks NestJS injection when factories are used.

`EntityAuditSubscriber` hooks: `afterInsert`, `beforeUpdate` (snapshot), `afterUpdate`, `afterRemove`. It skips `AuditLog` itself and any excluded entities.

`sanitize(obj)` redacts: `password`, `token`, `secret`, `apikey`, `creditcard`, `cvv`, `ssn`, `pin` (and derivatives) → `[REDACTED]`.

### `@bidbay/logger` — `libs/logger/src/`

`LoggerModule.forService(serviceName)` — wraps `nestjs-pino`.

**`AppLogger`** injectable methods:
```typescript
// HTTP
logRequest(req, traceId)
logResponse(req, statusCode, durationMs)
logError(req, error)

// Kafka
logKafkaIncoming(topic, eventId, payload)
logKafkaDuplicate(topic, eventId)
logKafkaSuccess(topic, eventId)
logKafkaError(topic, eventId, error)

// CQRS
logOperationStart(operation, payload)
logOperationSuccess(operation, result)
logOperationError(operation, error)

// Outbox
logOutboxPublished(eventType, eventId)
logOutboxError(eventType, eventId, error)

// Generic
log | info | warn | debug | error
```

Every log entry includes: `traceId`, `userId`, `service`, `path`, `timestamp`, `environment`, `ip`.

**Trace ID** (`x-trace-id`) flow:
1. `TraceIdMiddleware` reads or generates the header on every HTTP request.
2. `LoggerInterceptor` binds it to `AsyncLocalStorage` via `setTraceContext()`.
3. Gateway `OrdersService`/`InventoryService` forward it downstream via HTTP headers.
4. Outbox poller writes it as the Kafka `event-id` header.
5. Consumers call `setTraceContext({ traceId: eventId })` to bind it in the Kafka processing context.

---

## API Routes

### Gateway (Port 3000) — Public Interface

| Method | Path | Status | Forwards to |
|--------|------|--------|-------------|
| GET | /api/health | 200 | Internal |
| POST | /api/orders | 202 | Order Service POST /api/orders |
| GET | /api/orders?userId=&status=&page=&limit= | 200 | Order Service GET /api/orders |
| GET | /api/orders/:orderId | 200/404 | Order Service GET /api/orders/:orderId |
| POST | /api/inventory | 201 | Inventory Service POST /api/inventory |
| PATCH | /api/inventory/:sku | 200 | Inventory Service PATCH /api/inventory/:sku |
| GET | /api/inventory | 200 | Inventory Service GET /api/inventory |
| GET | /api/inventory/:sku | 200/404 | Inventory Service GET /api/inventory/:sku |

> `/outbox` and `/inbox` endpoints are **not exposed** through the gateway (internal observability only — query DB directly).

### Request/Response Contracts

**POST /api/orders**
```json
// Request
{ "userId": "<uuid>", "items": [{ "sku": "WIDGET-A", "quantity": 2, "price": 19.99 }] }
// Response 202
{ "orderId": "<uuid>", "status": "PENDING", "totalAmount": "39.98", "createdAt": "<iso>" }
```

**GET /api/orders**
```json
// Response 200
{ "data": [{ "orderId": "<uuid>", "status": "CONFIRMED", "totalAmount": "39.98", "itemCount": 1, "createdAt": "<iso>" }], "total": 1 }
```

**POST /api/inventory**
```json
// Request
{ "sku": "WIDGET-A", "availableQty": 100 }
// Response 201 — full Inventory entity
```

**PATCH /api/inventory/:sku**
```json
// Request
{ "availableQty": 50 }
// Response 200 — updated Inventory entity
```

---

## Environment Variables

All vars defined in `.env` at repo root. No `.env.example` — use this reference:

```env
# Databases (shared host for dev)
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

# Gateway upstream (optional override)
ORDER_SERVICE_URL=http://localhost:3001
INVENTORY_SERVICE_URL=http://localhost:3002
```

`TypeORM synchronize: true` is active in development (`NODE_ENV !== 'production'`). Disable and use migrations in production.

---

## Testing

### Jest Configuration

Each service has `jest.config.cts` with:
- **80% coverage threshold** (branches, functions, lines, statements)
- Module name mappers for shared libs:
  ```json
  { "^@bidbay/logger$": "<rootDir>/../../libs/logger/src/index.ts",
    "^@bidbay/audit$":  "<rootDir>/../../libs/audit/src/index.ts" }
  ```
- Coverage output: `coverage/api/<service>/`
- Excludes from coverage: `main.ts`, `*.module.ts`, `*.entity.ts`, `*.dto.ts`, `*.command.ts`, `*.query.ts`

### Testing Patterns

- Use `jest.mock` to isolate CommandBus/QueryBus in controller tests.
- Use in-memory `DataSource` or repository mocks for handler unit tests.
- Kafka consumers: mock `InboxRepository.tryInsert()` to test duplicate handling.
- Outbox poller: mock `ClientKafka.emit()` to verify retry logic.
- Audit + Logger libs: mock via module name mapper in consumer service tests.

---

## Security & Compliance Standards

> Apply these principles to every new feature, PR review, and code modification.

### Input Validation & Injection Prevention

- All DTOs use `class-validator` with strict decorators. Gateway global `ValidationPipe({ whitelist: true, transform: true })` strips undeclared fields.
- Never interpolate user input into raw SQL. Always use TypeORM query builder or parameterized queries.
- Use `@IsUUID()`, `@IsEnum()`, `@Min()`, `@Max()` to enforce field-level constraints at the DTO boundary.
- Validate `page`/`limit` with `@Min` / `@Max(50)` to prevent unbounded queries.

### Authentication & Authorization (Gaps to Address)

- Gateway currently reads `x-user-id` from headers without verification — this is a **critical security gap**. JWT validation must be added to the gateway before production.
- All downstream services trust `x-user-id` passed by the gateway. Once gateway auth is enforced, microservices are protected by network isolation (do not expose microservice ports publicly).
- When adding auth: implement a `JwtAuthGuard` at the gateway level; strip and re-sign `x-user-id` from the validated JWT claims.

### Sensitive Data Handling

- `sanitize()` in `@bidbay/audit` redacts sensitive fields from request bodies logged to `audit_logs`. Review `sensitiveFields` list when adding new PII fields.
- Never log raw credentials, tokens, or payment data. Pass through `sanitize()` before any persistence or log emission.
- `audit_logs.requestBody` and `audit_logs.requestQuery` are stored after sanitization — treat the `audit_logs` table as sensitive.

### OWASP Top 10 Checklist (current gaps)

| Risk | Status | Action Required |
|------|--------|----------------|
| A01 Broken Access Control | ⚠️ Gap | Add JWT auth to gateway; add resource ownership checks |
| A02 Cryptographic Failures | ⚠️ Gap | Encrypt `DB_PASS` and secrets via vault/secrets manager in prod |
| A03 Injection | ✓ Mitigated | TypeORM parameterized queries; DTO whitelist |
| A04 Insecure Design | ✓ Mitigated | Outbox/Inbox idempotency; CQRS; transaction boundaries |
| A05 Security Misconfiguration | ⚠️ Gap | Remove `synchronize: true` in prod; harden Kafka ACLs |
| A06 Vulnerable Components | ⚠️ Monitor | Run `pnpm audit` regularly; enforce SonarQube/Dependabot |
| A07 Auth Failures | ⚠️ Gap | No JWT implementation yet |
| A08 Data Integrity | ✓ Mitigated | Outbox pattern guarantees event integrity |
| A09 Logging Failures | ✓ Mitigated | Structured pino logs + audit trail |
| A10 SSRF | ⚠️ Gap | Validate upstream URLs in gateway service proxies |

### SAST / SonarQube / Fortify

When integrating static analysis:
- Enforce `pnpm audit --audit-level=high` in CI pipeline.
- SonarQube rules to enable: `typescript:S2092` (secure cookies), `typescript:S5122` (CORS), `typescript:S2755` (XXE), `typescript:S4790` (insecure hash).
- Fortify: flag any `process.env` values used without `ConfigService` (environment injection pattern).
- Never suppress SAST findings without a documented risk acceptance.
- Add `.sonarproject.properties` at repo root for multi-module NX scanning.

### Cross-Site Scripting (XSS)

This is a REST API, not a browser app. However:
- Set `Content-Type: application/json` explicitly on all responses (NestJS default).
- Add security headers middleware to the gateway: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`.
- If a frontend is added, sanitize all user-generated content server-side before persistence and use Content Security Policy headers.

### Dependency Management

- All runtime dependencies live in root `package.json` and are shared. No per-service version drift.
- `pnpm-workspace.yaml` lists `onlyBuiltDependencies` for native modules (`@nestjs/core`, `@swc/core`, `nx`).
- Run `pnpm audit` before any production release. Address all `high` and `critical` advisories.
- Pin major versions. Use `pnpm update --interactive` for controlled upgrades.
- Review transitive Kafka and TypeORM dependencies for known CVEs on each upgrade.

---

## Observability & Monitoring

### Structured Logging (Pino)

Every log entry is structured JSON with consistent fields:

```json
{
  "level": "info",
  "time": "<iso>",
  "service": "order-service",
  "traceId": "<uuid>",
  "userId": "<uuid>",
  "path": "/api/orders",
  "ip": "x.x.x.x",
  "msg": "..."
}
```

Log levels:
- `debug` — outbox poll cycles, Kafka consumer heartbeats
- `info` — request/response, CQRS operation start/success, Kafka published/consumed
- `warn` — duplicate inbox events, retried outbox rows
- `error` — handler exceptions, outbox publish failures, Kafka consumer errors

Never use `console.log`. Always inject `AppLogger` and use the typed methods.

### Distributed Tracing

Trace ID (`x-trace-id`) flows end-to-end:
1. Client sets header or gateway generates UUID.
2. `TraceIdMiddleware` reads it; `LoggerInterceptor` binds it to `AsyncLocalStorage`.
3. Gateway proxy services forward it in HTTP headers to microservices.
4. Outbox poller writes it as Kafka `event-id` header.
5. Consumers bind it via `setTraceContext({ traceId: eventId })`.
6. All logs and audit records carry the same `traceId` for the full request lifecycle.

To trace a slow or failed order end-to-end:
```sql
-- Find all logs/audit events for a trace
SELECT * FROM audit_logs WHERE trace_id = '<traceId>' ORDER BY created_at;

-- Find all outbox events for an order (Order Service DB — table is 'outbox', not 'order_outbox')
SELECT * FROM outbox WHERE aggregate_id = '<orderId>' ORDER BY created_at;

-- SAGA pipeline state
SELECT o.status, ob.status AS outbox_status, ib.status AS inbox_status
FROM orders o
LEFT JOIN outbox ob ON ob.aggregate_id = o.id
LEFT JOIN order_inbox ib ON ib.event_id = ob.id
WHERE o.id = '<orderId>';
```

### Performance Monitoring

- Audit interceptor records `durationMs` for every HTTP call — query `audit_logs` for slow endpoints.
- For production, expose a `/metrics` endpoint (Prometheus) via `@willsoto/nestjs-prometheus` or similar.
- Index strategy for `audit_logs`: `(userId, createdAt)`, `(entityType, entityId)`, `(traceId)` — do not add indexes without query analysis.
- `Inventory` uses `@VersionColumn` for optimistic locking — monitor `OptimisticLockVersionMismatchError` rate as a contention signal.

### Observability Queries (Internal — Not API Exposed)

```sql
-- Stuck outbox events (UNSENT after 5+ minutes)
-- Order Service DB: table is 'outbox'; Inventory Service DB: table is 'inventory_outbox'
SELECT * FROM outbox WHERE status = 'UNSENT' AND created_at < NOW() - INTERVAL '5 minutes';
SELECT * FROM inventory_outbox WHERE status = 'UNSENT' AND created_at < NOW() - INTERVAL '5 minutes';

-- Failed outbox events (exhausted retries)
SELECT * FROM outbox WHERE status = 'FAILED';

-- Duplicate inbox events (should never exceed 1 per eventId — data anomaly indicator)
SELECT event_id, COUNT(*) FROM order_inbox GROUP BY event_id HAVING COUNT(*) > 1;

-- Order status distribution
SELECT status, COUNT(*) FROM orders GROUP BY status;

-- Slow HTTP endpoints (> 1000ms)
SELECT http_path, AVG(duration_ms), MAX(duration_ms), COUNT(*)
FROM audit_logs
WHERE level = 'HTTP' AND duration_ms > 1000
GROUP BY http_path ORDER BY AVG(duration_ms) DESC;
```

---

## Code Conventions

| Concern | Rule |
|---------|------|
| Controllers | Dispatch only — `commandBus.execute()` / `queryBus.execute()`, nothing else |
| Handlers | Own all business logic; use `DataSource.transaction()` for multi-table writes |
| Repositories | Thin query abstractions only — no business rules |
| DTOs | `class-validator` decorators on every field; no optional without `@IsOptional()` |
| Transactions | `dataSource.transaction(async (em) => { ... })` — always atomic for outbox writes |
| Outbox writes | Must be in the **same transaction** as the domain record insert/update |
| Inbox guard | Call `tryInsert(eventId)` before processing; if `false`, return immediately |
| Kafka events | Write to outbox inside the handler transaction; poller publishes automatically |
| Error handling | Throw NestJS `HttpException` subclasses from handlers; do not catch and swallow |
| Logging | Inject `AppLogger`; use typed methods; never log raw request objects |
| Sensitive data | Pass through `sanitize()` before logging; never log passwords/tokens/PII |
| Environment | Always use `ConfigService`; never read `process.env` directly in business code |

---

## Adding a New Feature

### New Command (write operation)

1. `src/commands/my-action.command.ts` — plain class, no decorators
2. `src/commands/handlers/my-action.handler.ts` — `@CommandHandler(MyActionCommand)`, inject `DataSource`
3. Transaction: write domain record + outbox row atomically if event emission is needed
4. Register handler in `AppModule` providers
5. Add route in `AppController` → `commandBus.execute(new MyActionCommand(...))`
6. Add DTO with full `class-validator` decorators

### New Query (read operation)

1. `src/queries/my-query.query.ts` — plain class
2. `src/queries/handlers/my-query.handler.ts` — `@QueryHandler(MyQuery)`, inject repository
3. Register in `AppModule`; add GET route in `AppController`

### New Kafka Event

1. In the emitting handler: write outbox row (same transaction) with the new `eventType`
2. In the consuming service: add `@EventPattern('new.event')` in the consumer class
3. Consumer must: `tryInsert(eventId)` → process in transaction → mark inbox PROCESSED/FAILED
4. The outbox poller requires no changes — it publishes all `UNSENT` rows regardless of `eventType`

### New Service

```bash
pnpm nx generate @nx/nest:application my-new-service
```

Follow the order-service template:
- Hybrid app (`connectMicroservice` + `listen`)
- CQRS for all operations
- Outbox + Inbox for Kafka reliability
- Separate PostgreSQL database
- Import `LoggerModule.forService(name)` + `AuditModule.forService(name)` in AppModule
- Add `AuditLog` to TypeORM entities array
- Add Jest moduleNameMapper entries for `@bidbay/logger` and `@bidbay/audit`
- Add proxy routes to API Gateway (`src/<domain>/` folder, new `HttpModule`)
- Add port + DB name to `.env`

---

## Project Slash Commands

Project-level commands are in `.claude/commands/`. Invoke with `/command-name` in Claude Code.

| Command | Usage | Purpose |
|---------|-------|---------|
| `/review` | `/review` | Full multi-dimensional code review: architecture, security, reliability, performance, observability |
| `/security-audit` | `/security-audit` | SAST-level OWASP Top 10 scan — injection, auth gaps, XSS, sensitive data, config |
| `/new-command` | `/new-command order CancelOrder "cancel a pending order"` | Scaffold CQRS Command + Handler + DTO + tests |
| `/new-query` | `/new-query order GetOrderStats "order statistics for a user"` | Scaffold CQRS Query + Handler + DTO + tests |
| `/new-kafka-event` | `/new-kafka-event order inventory order.cancelled` | Add full Kafka event pipeline (outbox emit + inbox consumer + tests) |
| `/new-service` | `/new-service notification 3003 "email and push notifications"` | Scaffold complete NestJS microservice following BidBay architecture |
| `/saga-debug` | `/saga-debug <orderId>` | Debug a stuck SAGA — outputs diagnostic SQL + decision tree + recovery steps |
| `/test-coverage` | `/test-coverage order` | Run tests with coverage, identify gaps, generate missing test stubs |
| `/dep-audit` | `/dep-audit` | Audit dependencies for CVEs + outdated packages + action plan |
| `/perf-review` | `/perf-review` | Performance review — N+1 queries, missing indexes, Kafka throughput, memory |
| `/api-design` | `/api-design "GET /api/orders/:id/timeline"` | Review or design API endpoints against REST + security + contract standards |
| `/observability` | `/observability` | Audit logging/tracing/monitoring coverage — trace ID gaps, missing log calls, audit trail |
| `/db-review` | `/db-review` | Database schema, index strategy, query patterns, migration readiness |

---

## NX Build System Notes

- NX uses webpack-cli with `NxAppWebpackPlugin` (target: node, compiler: tsc).
- Build outputs: `dist/api/<service>/` — includes generated `package.json`.
- `pnpm-workspace.yaml` `onlyBuiltDependencies` covers native build-time deps (`nx`, `@swc/core`).
- **NX cache pitfall**: After editing `libs/audit` or `libs/logger`, run `pnpm nx reset` before rebuilding. Deleting `.nx/cache` is not enough — NX caches in multiple locations. `--skip-nx-cache` bypasses reads but does not flush stale cache.
- `nestjs-pino` emits a harmless `LegacyRouteConverter` warning for `/api/*` — ignore it.
