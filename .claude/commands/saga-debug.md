---
description: Debug a stuck SAGA — trace order through full pipeline
argument-hint: [orderId]
allowed-tools: Read, Bash(git:*)
model: sonnet
---

You are a senior distributed systems engineer debugging a stuck SAGA for order `$ARGUMENTS`.

The SAGA pipeline in BidBay is:
```
PlaceOrder → order_outbox (UNSENT)
           → OutboxPoller → Kafka: order.created
           → Inventory consumer → inventory stock check
           → inventory_outbox (UNSENT) → [inventory.reserved | inventory.failed]
           → OutboxPoller → Kafka: [inventory.reserved | inventory.failed]
           → Order consumer → order status: CONFIRMED | CANCELLED
```

---

## Step 1 — Understand the system

Read the current state of all SAGA-related components:

- `api/order-service/src/outbox/outbox-poller.service.ts`
- `api/order-service/src/consumers/inventory-events.consumer.ts`
- `api/order-service/src/repositories/outbox.repository.ts`
- `api/order-service/src/repositories/inbox.repository.ts`
- `api/inventory-service/src/consumers/order-events.consumer.ts`
- `api/inventory-service/src/outbox/outbox-poller.service.ts`
- `api/inventory-service/src/repositories/inbox.repository.ts`

---

## Step 2 — Provide SQL diagnostic queries

Output the following SQL queries the developer should run against each database to trace the stuck order `$ARGUMENTS`. Format them clearly for copy-paste execution.

**Database: `order_service`**

```sql
-- 1. Order current state
SELECT id, user_id, status, failure_reason, total_amount, created_at, updated_at
FROM orders
WHERE id = '$ARGUMENTS';

-- 2. Outbox event for this order
SELECT id AS event_id, event_type, status, retry_count, created_at, sent_at
FROM outbox
WHERE aggregate_id = '$ARGUMENTS'
ORDER BY created_at DESC;

-- 3. Inbox events received for this order's outbox event
--    (join outbox.id → inbox.event_id)
SELECT oi.event_id, oi.topic, oi.status, oi.failure_reason, oi.received_at, oi.processed_at
FROM order_inbox oi
JOIN outbox ob ON oi.event_id = ob.id
WHERE ob.aggregate_id = '$ARGUMENTS';

-- 4. All stuck outbox events (for context)
SELECT id, aggregate_id, event_type, status, retry_count, created_at
FROM outbox
WHERE status = 'UNSENT' AND created_at < NOW() - INTERVAL '2 minutes'
ORDER BY created_at;
```

**Database: `inventory_service`**

```sql
-- 5. Inventory inbox — did inventory-service receive order.created?
SELECT event_id, topic, status, failure_reason, received_at, processed_at
FROM inventory_inbox
WHERE event_id = (
  SELECT id FROM outbox WHERE aggregate_id = '$ARGUMENTS' LIMIT 1
);

-- 6. Inventory outbox — did inventory-service emit a response?
SELECT id AS event_id, aggregate_id AS order_id, event_type, status, retry_count, created_at, sent_at
FROM inventory_outbox
WHERE aggregate_id = '$ARGUMENTS'
ORDER BY created_at DESC;

-- 7. Inventory stock at time of order (current state)
-- (replace SKUs with actual items from the order)
SELECT sku, available_qty, reserved_qty, version, updated_at
FROM inventory;
```

---

## Step 3 — Diagnosis decision tree

Based on the query results (ask the developer to share them), walk through this decision tree:

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `order_outbox.status = UNSENT` | OutboxPoller not running or Kafka unreachable | Check service logs, Kafka broker connectivity |
| `order_outbox.status = FAILED`, retryCount = 5 | Kafka publish failed 5 times | Check `KAFKA_BROKERS` env var; restart Kafka |
| `order_outbox.status = SENT` but no `inventory_inbox` row | Inventory-service consumer not running | Check inventory-service Kafka consumer group |
| `inventory_inbox.status = UNPROCESSED` | Consumer received but didn't process | Check inventory-service error logs for that eventId |
| `inventory_inbox.status = FAILED` | Domain logic threw exception | Read `failure_reason`; check inventory-service logs |
| `inventory_inbox.status = PROCESSED` but no `inventory_outbox` row | Bug: outbox not written in same transaction | Check `OrderEventsConsumer` transaction logic |
| `inventory_outbox.status = UNSENT` | Inventory outbox poller not running | Check inventory-service logs |
| `inventory_outbox.status = SENT` but `order_inbox` has no row | Order-service Kafka consumer not running | Check order-service Kafka consumer group |
| `order_inbox.status = PROCESSED` but `order.status = PENDING` | Bug in `InventoryEventsConsumer` update logic | Read handler code and check for DB error |

---

## Step 4 — Log search guidance

Tell the developer which log entries to search for using the traceId (= outbox event UUID):

```bash
# If using pino-pretty or grep on log file:
grep "<outbox_event_id>" /var/log/order-service.log
grep "<outbox_event_id>" /var/log/inventory-service.log

# Look for these log keys:
# logKafkaIncoming — consumer received the event
# logKafkaDuplicate — deduplicated (not an error)
# logKafkaSuccess — consumer processed successfully
# logKafkaError — consumer failed
# logOutboxPublished — poller sent to Kafka
# logOutboxError — poller failed
```

---

## Step 5 — Recovery actions

Provide specific recovery SQL if appropriate:

```sql
-- Reset a stuck outbox row to retry (if FAILED and root cause fixed):
UPDATE order_outbox SET status = 'UNSENT', retry_count = 0 WHERE id = '<outbox_event_id>';
UPDATE inventory_outbox SET status = 'UNSENT', retry_count = 0 WHERE id = '<outbox_event_id>';

-- Remove a stuck inbox row to allow reprocessing (DANGEROUS — only if root cause is fixed):
-- DELETE FROM inventory_inbox WHERE event_id = '<event_id>';
```

⚠️ Warn the developer that deleting inbox rows can cause double-processing. Only do this if the consumer is idempotent for this event.

---

Conclude with a clear diagnosis and next action, even if the developer hasn't yet run the queries. Provide the most likely culprit based on what is known.
