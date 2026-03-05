import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InventoryOutbox, OutboxStatus } from '../entities/inventory-outbox.entity';

@Injectable()
export class OutboxRepository {
  private readonly logger = new Logger(OutboxRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  findUnsentLocked(em: EntityManager, batchSize = 10): Promise<InventoryOutbox[]> {
    return em
      .getRepository(InventoryOutbox)
      .createQueryBuilder('outbox')
      .where('outbox.status = :status', { status: OutboxStatus.UNSENT })
      .orderBy('outbox.createdAt', 'ASC')
      .take(batchSize)
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getMany();
  }

  markSent(em: EntityManager, outbox: InventoryOutbox): Promise<InventoryOutbox> {
    outbox.status = OutboxStatus.SENT;
    outbox.sentAt = new Date();
    return em.save(InventoryOutbox, outbox);
  }

  markFailed(em: EntityManager, outbox: InventoryOutbox): Promise<InventoryOutbox> {
    outbox.retryCount += 1;
    if (outbox.retryCount >= 5) {
      outbox.status = OutboxStatus.FAILED;
      this.logger.error(`Outbox row ${outbox.id} permanently failed after 5 attempts`);
    }
    return em.save(InventoryOutbox, outbox);
  }
}
