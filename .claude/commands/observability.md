---
description: Audit logging, tracing, and monitoring coverage across all services
allowed-tools: Read, Grep
model: sonnet
---

You are a senior SRE and observability engineer. Audit the logging, tracing, and monitoring coverage of this codebase to ensure it meets production-grade observability standards.

---

## Step 1 — Read all relevant files

Read every file that emits logs or handles requests:

- `libs/logger/src/` (all files — understand AppLogger contract)
- `libs/audit/src/` (all files — understand audit trail)
- `api/order-service/src/app/app.controller.ts`
- `api/order-service/src/commands/handlers/` (all)
- `api/order-service/src/queries/handlers/` (all)
- `api/order-service/src/consumers/` (all)
- `api/order-service/src/outbox/outbox-poller.service.ts`
- `api/inventory-service/src/app/app.controller.ts`
- `api/inventory-service/src/commands/handlers/` (all)
- `api/inventory-service/src/queries/handlers/` (all)
- `api/inventory-service/src/consumers/` (all)
- `api/inventory-service/src/outbox/outbox-poller.service.ts`
- `api/api-gateway/src/orders/orders.service.ts`
- `api/api-gateway/src/inventory/inventory.service.ts`

---

## Step 2 — Trace ID Coverage Audit

Verify that `traceId` (`x-trace-id`) is correctly propagated through every hop:

| Hop | Expected | Status |
|-----|----------|--------|
| Client → Gateway | Generated or read from `x-trace-id` header | ✓/✗ |
| Gateway → Order Service (HTTP) | Forwarded via `x-trace-id` header in axios call | ✓/✗ |
| Gateway → Inventory Service (HTTP) | Forwarded via `x-trace-id` header in axios call | ✓/✗ |
| Order Service → Kafka | Written as `event-id` header in outbox | ✓/✗ |
| Inventory Service consumer | Bound to AsyncLocalStorage via `setTraceContext` | ✓/✗ |
| Inventory Service → Kafka | Written as `event-id` header in outbox | ✓/✗ |
| Order Service consumer | Bound to AsyncLocalStorage via `setTraceContext` | ✓/✗ |

Flag any hops where traceId is lost.

---

## Step 3 — Logging Completeness Audit

For each operation type, verify the correct `AppLogger` method is called:

### HTTP Operations (Controllers)
Each request should log:
- `logRequest` on entry (via `LoggerInterceptor` — already handled by lib)
- `logResponse` on success (via interceptor)
- `logError` on exception (via interceptor)

Verify the interceptor is not bypassed anywhere.

### CQRS Operations (Handlers)
Each handler should call:
- `logOperationStart(operationName, { relevant params })` at entry
- `logOperationSuccess(operationName, result)` on success
- `logOperationError(operationName, error)` in catch block

Flag any handler missing these calls.

### Kafka Consumer Operations
Each `@EventPattern` handler should call:
- `logKafkaIncoming(topic, eventId, payload)` at entry
- `logKafkaDuplicate(topic, eventId)` when `tryInsert` returns false
- `logKafkaSuccess(topic, eventId)` on successful processing
- `logKafkaError(topic, eventId, error)` on any exception

### Outbox Poller
Should call:
- `logOutboxPublished(eventType, eventId)` for each published row
- `logOutboxError(eventType, eventId, error)` on publish failure

### Sensitive Data Check
Grep for any log calls that might pass raw request bodies, passwords, or tokens:
- Is `sanitize()` applied before any requestBody is logged?
- Are no raw `password`, `token`, `creditcard` fields in any log call?

---

## Step 4 — Audit Trail Coverage

Verify `audit_logs` captures all required operations:

| Operation | Audit Level | Expected in audit_logs | Status |
|-----------|-------------|----------------------|--------|
| POST /api/orders | HTTP | method, path, userId, status, duration | ✓/✗ |
| GET /api/orders | HTTP | method, path, userId, status, duration | ✓/✗ |
| Order entity INSERT | ENTITY | action=CREATE, beforeState=null, afterState | ✓/✗ |
| Order entity UPDATE (status change) | ENTITY | action=UPDATE, diff with old/new status | ✓/✗ |
| POST /api/inventory | HTTP | method, path, userId, status, duration | ✓/✗ |
| Inventory entity UPDATE | ENTITY | action=UPDATE, diff with qty changes | ✓/✗ |

Check that `EntityAuditSubscriber` is correctly registered as a TypeORM subscriber in both microservices.

---

## Step 5 — Error Observability

For each service, verify:
- Are exceptions caught and logged with `logOperationError` before rethrowing?
- Are Kafka consumer errors logged with `logKafkaError` with the eventId for correlation?
- Are outbox poller errors logged with `logOutboxError` with the eventId?
- Are 5xx errors distinguishable from 4xx errors in logs (`outcome: ERROR` vs `FAILURE`)?
- Is the error message sanitized before logging (no sensitive data in stack traces)?

---

## Step 6 — Monitoring Readiness Assessment

Rate each area 🟢 Ready | 🟡 Partial | 🔴 Missing:

| Capability | Status | Gap / Action |
|-----------|--------|-------------|
| Structured JSON logging (Pino) | | |
| Distributed trace ID propagation | | |
| HTTP request/response audit trail | | |
| Entity change audit trail (diff) | | |
| CQRS operation lifecycle logging | | |
| Kafka consumer lifecycle logging | | |
| Outbox poller lifecycle logging | | |
| Health check endpoint (`/api/health`) | | |
| Metrics endpoint (Prometheus `/metrics`) | | |
| Alertable error log patterns | | |
| Log retention/archival strategy | | |
| Centralized log aggregation (e.g., ELK) | | |

---

## Step 7 — Recommendations

List specific code changes to fill observability gaps, ordered by impact.

For each recommendation, provide the file path, the specific log call to add, and why it matters for production debugging.
