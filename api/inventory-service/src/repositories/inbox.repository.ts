import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InventoryInbox, InboxStatus } from '../entities/inventory-inbox.entity';

@Injectable()
export class InboxRepository {
  constructor(private readonly dataSource: DataSource) {}

  async tryInsert(
    em: EntityManager,
    eventId: string,
    topic: string,
    eventType: string,
  ): Promise<boolean> {
    try {
      await em.insert(InventoryInbox, {
        eventId,
        topic,
        eventType,
        status: InboxStatus.UNPROCESSED,
      });
      return true;
    } catch {
      return false; // unique violation = duplicate event
    }
  }

  markProcessed(em: EntityManager, eventId: string): Promise<void> {
    return em
      .getRepository(InventoryInbox)
      .update(eventId, { status: InboxStatus.PROCESSED, processedAt: new Date() })
      .then(() => undefined);
  }

  markFailed(em: EntityManager, eventId: string, reason: string): Promise<void> {
    return em
      .getRepository(InventoryInbox)
      .update(eventId, { status: InboxStatus.FAILED, failureReason: reason })
      .then(() => undefined);
  }
}
