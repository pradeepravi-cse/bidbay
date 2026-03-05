/**
 * Thin wrapper over the outbox table — used by the OutboxPoller.
 * All business-logic writes to the outbox happen inline in transactions
 * managed by the handlers (they use EntityManager directly).
 */
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Outbox, OutboxStatus } from '../entities/order-outbox.entity';

@Injectable()
export class OutboxRepository {
  private readonly logger = new Logger(OutboxRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Fetch up to `batchSize` UNSENT rows and lock them so that concurrent
   * poller instances (horizontal scaling) skip already-locked rows.
   *
   * WHY FOR UPDATE SKIP LOCKED?
   * ──────────────────────────
   * If you run two pods of this service, both pollers would see the same UNSENT
   * rows. Without locking, both pods would publish the same message to Kafka
   * (duplicate events). SKIP LOCKED means: "lock what you can, skip the rest".
   * Pod A locks rows 1-10; Pod B skips them and takes rows 11-20.
   *
   * Must be called inside a transaction so the lock is held for the duration.
   */
  findUnsentLocked(em: EntityManager, batchSize = 10): Promise<Outbox[]> {
    return em
      .getRepository(Outbox)
      .createQueryBuilder('outbox')
      .where('outbox.status = :status', { status: OutboxStatus.UNSENT })
      .orderBy('outbox.createdAt', 'ASC')
      .take(batchSize)
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getMany();
  }

  markSent(em: EntityManager, outbox: Outbox): Promise<Outbox> {
    outbox.status = OutboxStatus.SENT;
    outbox.sentAt = new Date();
    return em.save(Outbox, outbox);
  }

  markFailed(em: EntityManager, outbox: Outbox): Promise<Outbox> {
    outbox.retryCount += 1;
    if (outbox.retryCount >= 5) {
      outbox.status = OutboxStatus.FAILED;
      this.logger.error(`Outbox row ${outbox.id} permanently failed after 5 attempts`);
    }
    return em.save(Outbox, outbox);
  }
}
