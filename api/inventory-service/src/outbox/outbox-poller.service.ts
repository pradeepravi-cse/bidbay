/**
 * Inventory Service — Outbox Poller
 * Same pattern as the Order Service poller. Publishes:
 *   • inventory.reserved
 *   • inventory.failed
 */
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClientKafka } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { OutboxRepository } from '../repositories/outbox.repository';
import { AppLogger } from '@bidbay/logger';

const CTX = { service: 'InventoryService', location: 'OutboxPollerService' };

@Injectable()
export class OutboxPollerService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outboxRepo: OutboxRepository,
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
    this.logger.info({ type: 'startup', ...CTX }, 'Outbox poller connected to Kafka');
  }

  @Cron('*/2 * * * * *')
  async poll() {
    await this.dataSource.transaction(async (em) => {
      const rows = await this.outboxRepo.findUnsentLocked(em);
      if (!rows.length) return;

      this.logger.debug({ type: 'outbox-poll', rowCount: rows.length, ...CTX }, `Outbox poll: processing ${rows.length} row(s)`);

      for (const row of rows) {
        try {
          await firstValueFrom(
            this.kafkaClient.emit(row.eventType, {
              headers: { 'event-id': row.id },
              value:   JSON.stringify(row.payload),
            }),
          );
          await this.outboxRepo.markSent(em, row);
          this.logger.logOutboxPublished(row.eventType, row.id, CTX);
        } catch (err) {
          this.logger.logOutboxError(row.eventType, row.id, err, CTX);
          await this.outboxRepo.markFailed(em, row);
        }
      }
    });
  }
}
