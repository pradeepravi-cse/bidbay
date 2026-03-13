---
description: Add a new Kafka event — outbox emit + consumer with inbox guard
argument-hint: [emitting-service: order|inventory] [consuming-service: order|inventory] [event-type e.g. order.cancelled]
allowed-tools: Read, Write, Edit
model: sonnet
---

You are a senior distributed systems architect. Add a complete, reliable Kafka event pipeline from `$1-service` (emitter) to `$2-service` (consumer) for the event type `$3`.

This implements the Transactional Outbox + Inbox pattern — the only safe way to add Kafka events in this system.

---

## Step 1 — Read existing patterns

Read these files to match existing implementations exactly:

**Emitter side:**
- `api/$1-service/src/entities/` (all outbox entity)
- `api/$1-service/src/repositories/outbox.repository.ts`
- `api/$1-service/src/outbox/outbox-poller.service.ts`

**Consumer side:**
- `api/$2-service/src/entities/` (all inbox entity)
- `api/$2-service/src/consumers/` (all existing consumers)
- `api/$2-service/src/repositories/inbox.repository.ts`
- `api/$2-service/src/app/app.module.ts`

---

## Step 2 — Emitter side: write to outbox

In the relevant command handler in `$1-service`, add an outbox write **inside the same transaction** as the domain record change:

```typescript
await em.save($1OutboxEntity, {
  id: uuidv4(),               // becomes Kafka event-id header
  aggregateId: domainRecord.id,
  aggregateType: '$1EntityName',
  eventType: '$3',
  payload: {
    // include all fields the consumer needs
    // do NOT include sensitive data (passwords, tokens)
  },
  status: 'UNSENT',
  retryCount: 0,
});
```

The outbox poller in `$1-service` will automatically publish this row. No other emitter changes needed.

---

## Step 3 — Consumer side: add @EventPattern handler

Add a new method to the existing consumer class in `$2-service`:
`api/$2-service/src/consumers/*.consumer.ts`

```typescript
@EventPattern('$3')
async handle$3Event(
  @Payload() data: any,
  @Ctx() ctx: KafkaContext,
): Promise<void> {
  const eventId = ctx.getMessage().headers?.['event-id']?.toString();
  const traceId = eventId;

  this.logger.logKafkaIncoming('$3', eventId, data);

  await this.dataSource.transaction(async (em) => {
    // 1. Inbox guard — deduplicate
    const inserted = await this.inboxRepository.tryInsert(
      em, eventId, '$3', '$3'
    );
    if (!inserted) {
      this.logger.logKafkaDuplicate('$3', eventId);
      return;
    }

    // 2. Business logic
    // TODO: implement domain logic here

    // 3. If this service needs to emit a response event, write outbox row here
    // await em.save($2OutboxEntity, { ... status: 'UNSENT' });

    // 4. Mark inbox processed
    await this.inboxRepository.markProcessed(em, eventId);
  });

  this.logger.logKafkaSuccess('$3', eventId);
}
```

Requirements:
- ALWAYS call `tryInsert` first — if false, return immediately (duplicate)
- Run domain changes + inbox mark in ONE transaction
- If emitting a reply event, write outbox row in the SAME transaction
- Never process without first recording in inbox
- Log at each stage: incoming → duplicate|success|error

---

## Step 4 — Register consumer in AppModule

Verify (or add) the consumer controller in `api/$2-service/src/app/app.module.ts`:
```typescript
controllers: [..., ExistingConsumerClass],
```

If a new consumer class is needed (currently none exists in `$2-service`), create:
`api/$2-service/src/consumers/$3-events.consumer.ts`

And register in AppModule controllers array.

---

## Step 5 — Define TypeScript interface for the event payload

Create or update a shared types file in the emitting service:
`api/$1-service/src/events/$3.event.ts`

```typescript
export interface $3Event {
  // typed fields matching what the handler emits
}
```

Use this interface in the consumer for type safety.

---

## Step 6 — Write unit tests for the consumer handler

File: `api/$2-service/src/consumers/...consumer.spec.ts`

Test cases:
- Happy path: event processed, inbox marked, domain updated
- Duplicate event: `tryInsert` returns false → early return, no domain change
- Domain error: transaction rolls back, inbox NOT marked processed
- Missing eventId header: handled gracefully

Mock: `DataSource`, `EntityManager`, `InboxRepository`, `AppLogger`

---

## Step 7 — Verification checklist

Confirm:
- [ ] Outbox write is inside the domain handler transaction
- [ ] Consumer calls `tryInsert` before any domain logic
- [ ] Consumer marks inbox PROCESSED at end of same transaction
- [ ] Kafka `event-id` header is the outbox row UUID
- [ ] Both services have the consumer registered in AppModule controllers
- [ ] No sensitive data in outbox payload
- [ ] TypeScript interface defined for event payload

List all files created or modified.
