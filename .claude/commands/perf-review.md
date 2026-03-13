---
description: Performance review — DB queries, N+1, indexes, Kafka throughput, memory
allowed-tools: Read, Grep
model: sonnet
---

You are a senior performance engineer. Review this codebase for performance bottlenecks, inefficient query patterns, and scalability risks.

---

## Step 1 — Read all data-access code

Read every file that touches the database or Kafka:

- `api/order-service/src/repositories/` (all files)
- `api/inventory-service/src/repositories/` (all files)
- `api/order-service/src/commands/handlers/` (all files)
- `api/order-service/src/queries/handlers/` (all files)
- `api/inventory-service/src/commands/handlers/` (all files)
- `api/inventory-service/src/queries/handlers/` (all files)
- `api/order-service/src/consumers/inventory-events.consumer.ts`
- `api/inventory-service/src/consumers/order-events.consumer.ts`
- `api/order-service/src/outbox/outbox-poller.service.ts`
- `api/inventory-service/src/outbox/outbox-poller.service.ts`
- `api/order-service/src/entities/` (all entities — check indexes)
- `api/inventory-service/src/entities/` (all entities — check indexes)

---

## Step 2 — Database Query Analysis

### N+1 Query Detection
- Are relations loaded inside loops? (e.g., `for item of orders: await item.user`)
- Are `find()` calls made per-iteration rather than with `relations` or `JOIN`?
- Are `JSONB` item arrays accessed without needing separate queries?

### Unbounded Queries
- Is every list query paginated with a `LIMIT`?
- Is there a `@Max(50)` or equivalent on the `limit` query param?
- Are `findAll()` repository methods bounded?

### Missing Indexes
Check the entity decorators for `@Index` coverage. Flag queries that filter/sort on un-indexed columns:
- `orders.userId` — is it indexed? (used in `GET /api/orders?userId=`)
- `orders.status` — is it indexed? (used as a filter)
- `order_outbox.status` — is it indexed? (queried every 2s by poller)
- `inventory.sku` — is it `UNIQUE` (acts as index)?
- `audit_logs` — check existing indexes match query patterns

### Transaction Scope
- Are any transactions holding locks longer than necessary?
- Are read operations (queries) wrapped in unnecessary transactions?
- Is `FOR UPDATE SKIP LOCKED` used correctly (not `FOR UPDATE` without `SKIP LOCKED`)?

### TypeORM Optimizations
- Are `select` projections used to avoid loading full entities when only a subset of columns is needed?
- Are `@VersionColumn` optimistic lock conflicts retried or bubbled up as 409?

---

## Step 3 — Kafka Throughput Analysis

### Outbox Poller
- What is the cron interval? (every 2s = 30 polls/minute — is this appropriate?)
- What is the batch size? Is it tunable via config or hardcoded?
- Is `FOR UPDATE SKIP LOCKED` used to allow multiple pollers across pods without conflict?
- Are poller errors logged and instrumented (not silently swallowed)?
- Is the Kafka `emit()` awaited or fire-and-forget? (fire-and-forget risks silent drops)

### Kafka Consumer
- Is there a `max.poll.records` or equivalent batch size configured?
- Are consumers processing one message at a time synchronously? (single-threaded consumer is the NestJS default — acceptable for low-volume, may need parallelism for high-volume)
- Are consumers committing offsets only after successful processing?

---

## Step 4 — Memory & CPU Risks

- Are large JSONB payloads fetched when only a subset is needed?
- Are `audit_logs` rows growing unboundedly? Is there a retention/archival strategy?
- Is the `items` JSONB column on `orders` indexed for any GIN queries?
- Is `nestjs-pino` configured with appropriate log level (not `debug` in production)?

---

## Step 5 — API Layer Performance

- Are HTTP responses from the gateway serialized twice (once in microservice, once in gateway)?
- Are there any synchronous blocking operations in gateway proxy services?
- Is there HTTP keep-alive enabled between gateway and microservices?
- Are timeouts configured on `HttpModule` in the gateway?

---

## Output Format

### Findings

| # | Location | Issue | Impact | Fix |
|---|----------|-------|--------|-----|
| 1 | `repo/order.repository.ts:42` | N+1 query in list | High | Use `JOIN` or `relations` |
| 2 | `outbox-poller.service.ts:28` | Hardcoded batch=10 | Medium | Move to ConfigService |

### Index Recommendations

List any indexes to add with the TypeORM decorator and the query that motivates it.

### Quick Wins

List 3 changes that would have the highest performance impact with the lowest implementation effort.
