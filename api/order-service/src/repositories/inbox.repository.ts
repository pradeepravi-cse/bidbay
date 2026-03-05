/**
 * Inbox repository — handles the deduplication guard for Kafka consumers.
 *
 * HOW IT WORKS
 * ────────────
 * 1. Consumer receives a Kafka message with an `event-id` header.
 * 2. It calls `tryInsert(eventId, ...)` — this attempts an INSERT.
 * 3. If the eventId already exists (UNIQUE violation) → duplicate → skip.
 * 4. If the INSERT succeeds → process the event → call `markProcessed`.
 *
 * The UNIQUE constraint is enforced by the PrimaryColumn on OrderInbox.eventId.
 * We don't need a SELECT-then-INSERT; the INSERT itself is the check.
 */
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { OrderInbox, InboxStatus } from '../entities/order-inbox.entity';

@Injectable()
export class InboxRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Returns true if the row was newly inserted (first time we see this event).
   * Returns false if the INSERT failed due to a duplicate eventId.
   */
  async tryInsert(
    em: EntityManager,
    eventId: string,
    topic: string,
    eventType: string,
  ): Promise<boolean> {
    try {
      await em.insert(OrderInbox, {
        eventId,
        topic,
        eventType,
        status: InboxStatus.UNPROCESSED,
      });
      return true; // freshly inserted → proceed with processing
    } catch {
      return false; // duplicate key → idempotent skip
    }
  }

  markProcessed(em: EntityManager, eventId: string): Promise<void> {
    return em
      .getRepository(OrderInbox)
      .update(eventId, { status: InboxStatus.PROCESSED, processedAt: new Date() })
      .then(() => undefined);
  }

  markFailed(em: EntityManager, eventId: string, reason: string): Promise<void> {
    return em
      .getRepository(OrderInbox)
      .update(eventId, { status: InboxStatus.FAILED, failureReason: reason })
      .then(() => undefined);
  }
}
