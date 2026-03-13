---
description: Scaffold a complete new NestJS microservice following BidBay architecture
argument-hint: [service-name] [port] [description]
allowed-tools: Read, Write, Edit, Bash(pnpm:*), Bash(git:*)
model: opus
---

You are a senior application architect. Scaffold a complete, production-ready NestJS microservice called `$1-service` on port `$2`.

**Service purpose:** $3

This service must follow the exact BidBay architecture: CQRS + Transactional Outbox/Inbox + Kafka + Pino logging + Audit trail.

---

## Step 1 — Read existing service for reference

Read the complete structure of an existing service to clone the pattern precisely:

- `api/order-service/src/main.ts`
- `api/order-service/src/app/app.module.ts`
- `api/order-service/src/app/app.controller.ts`
- `api/order-service/src/entities/order.entity.ts`
- `api/order-service/src/entities/order-outbox.entity.ts`
- `api/order-service/src/entities/order-inbox.entity.ts`
- `api/order-service/src/repositories/outbox.repository.ts`
- `api/order-service/src/repositories/inbox.repository.ts`
- `api/order-service/src/outbox/outbox-poller.service.ts`
- `api/order-service/jest.config.cts`
- `api/order-service/tsconfig.json`
- `api/order-service/tsconfig.app.json`
- `api/order-service/tsconfig.spec.json`
- `api/order-service/webpack.config.js`
- `api/order-service/project.json`
- `nx.json`
- `tsconfig.base.json`

---

## Step 2 — Generate the NX project

Run the NX generator:
```bash
pnpm nx generate @nx/nest:application $1-service --directory=api/$1-service --no-interactive
```

Then overwrite the generated files with the correct BidBay structure (steps below).

---

## Step 3 — Generate all required files

### 3a. main.ts
- Hybrid app: `connectMicroservice(KAFKA)` + `listen(HTTP)`
- Consumer group: `$1-service`
- Port: `process.env.$1_SERVICE_PORT ?? '$2'`
- `bufferLogs: true`, use nestjs-pino Logger
- Global prefix `/api`
- ValidationPipe `{ whitelist: true, transform: true }`

### 3b. AppModule
Imports:
- `ConfigModule.forRoot({ isGlobal: true })`
- `LoggerModule.forService('$1-service')`
- `AuditModule.forService('$1-service')` — `persistToDb: true`
- `TypeOrmModule.forRootAsync` — reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `$1_DB_NAME`
  - Entities: `[$1Entity, $1OutboxEntity, $1InboxEntity, AuditLog]`
  - `autoLoadEntities: true`
  - `synchronize: process.env.NODE_ENV !== 'production'`
- `CqrsModule`
- `ScheduleModule.forRoot()`
- `ClientsModule.registerAsync` — Kafka producer with clientId `'$1-producer'`

### 3c. Domain Entity
`api/$1-service/src/entities/$1.entity.ts`
- `@Entity('$1s')`
- `id`: UUID PK with `@PrimaryGeneratedColumn('uuid')`
- `@VersionColumn() version: number` — optimistic locking
- `createdAt`, `updatedAt` timestamps

### 3d. Outbox Entity
`api/$1-service/src/entities/$1-outbox.entity.ts`
Mirror `order-outbox.entity.ts` with table name `$1_outbox`.

### 3e. Inbox Entity
`api/$1-service/src/entities/$1-inbox.entity.ts`
Mirror `order-inbox.entity.ts` with table name `$1_inbox`.

### 3f. OutboxRepository
`api/$1-service/src/repositories/outbox.repository.ts`
Copy `order-service` pattern exactly (findUnsentLocked, markSent, markFailed).

### 3g. InboxRepository
`api/$1-service/src/repositories/inbox.repository.ts`
Copy `order-service` pattern exactly (tryInsert, markProcessed, markFailed).

### 3h. OutboxPollerService
`api/$1-service/src/outbox/outbox-poller.service.ts`
Copy `order-service` pattern. Inject `KAFKA_CLIENT`, `DataSource`, `OutboxRepository`, `AppLogger`.

### 3i. AppController
`api/$1-service/src/app/app.controller.ts`
Thin CQRS dispatcher. Add a placeholder `GET /api/$1s` → `GetAll$1Query`.

### 3j. Stub Command + Query
Scaffold one example command and one query following `new-command` and `new-query` patterns.

---

## Step 4 — Config files

### jest.config.cts
Copy from `api/order-service/jest.config.cts` with service name substituted.
Include moduleNameMapper for `@bidbay/logger` and `@bidbay/audit`.

### tsconfig.json / tsconfig.app.json / tsconfig.spec.json
Copy from order-service, substituting service name.

### webpack.config.js
Copy from order-service, substituting service name and port.

### project.json
Copy from order-service, substituting `$1-service` in all targets.

---

## Step 5 — Gateway integration

Add proxy routes to the API Gateway:

### New folder: `api/api-gateway/src/$1s/`

Files to create:
- `$1s.controller.ts` — proxy controller
- `$1s.service.ts` — HttpModule proxy service
- `$1s.module.ts` — imports HttpModule with `baseURL: process.env.$1_SERVICE_URL ?? 'http://localhost:$2'`

Register `$1sModule` in `api/api-gateway/src/app/app.module.ts`.

---

## Step 6 — Environment variables

Add to `.env`:
```env
$1_SERVICE_PORT=$2
$1_DB_NAME=$1_service
$1_SERVICE_URL=http://localhost:$2
```

Update `CLAUDE.md` Services table with the new service.

---

## Step 7 — Verification

After scaffold:
1. Run `pnpm nx build $1-service` — must compile clean
2. Run `pnpm nx lint $1-service` — must pass
3. Run `pnpm nx test $1-service` — stub tests must pass

Report any compilation errors and fix them.

List all files created/modified.

---

## Architecture Reminders

- The service must be a **hybrid app** (HTTP + Kafka in same process)
- CQRS for all operations — never put business logic in controllers
- Outbox + Inbox for any Kafka events — never publish directly from handlers
- `AuditLog` entity must be in TypeORM entities array
- Jest `moduleNameMapper` must include `@bidbay/logger` and `@bidbay/audit` paths
- Never add `@Injectable` to the Command or Query classes themselves
