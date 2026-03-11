/**
 * OUTBOX POLLER
 * ─────────────
 * This is the "relay" that bridges the local DB and Kafka.
 *
 * WHY A SEPARATE POLLER?
 * ──────────────────────
 * The HTTP handler writes the outbox row and returns 202 immediately.
 * It does NOT call Kafka directly because:
 *   • Kafka could be down at that moment
 *   • The publish might fail after the HTTP response was sent
 *
 * The poller retries automatically and handles transient Kafka failures.
 *
 * FLOW (every 2 seconds):
 *  1. BEGIN transaction
 *  2. SELECT * FROM outbox WHERE status = UNSENT
 *       ORDER BY createdAt ASC LIMIT 10
 *       FOR UPDATE SKIP LOCKED    ← prevents duplicate publishing across pods
 *  3. For each row:
 *       a. emit to Kafka (topic = eventType, event-id header = outbox.id)
 *       b. on success: mark SENT
 *       c. on failure: increment retryCount (mark FAILED after 5 attempts)
 *  4. COMMIT
 *
 * HORIZONTAL SCALING
 * ──────────────────
 * "FOR UPDATE SKIP LOCKED" means if you run 3 pods:
 *   Pod A locks rows 1-10
 *   Pod B skips 1-10, locks 11-20
 *   Pod C skips 1-20, locks 21-30
 * No duplicate publishes. No deadlocks.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { OutboxRepository } from '../repositories/outbox.repository';
import { AppLogger } from '@bidbay/logger';

const CTX = { service: 'OrderService', location: 'OutboxPollerService' };

@Injectable()
export class OutboxPollerService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outboxRepo: OutboxRepository,
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    private readonly logger: AppLogger,
  ) {}

  /** Connect the Kafka producer on startup */
  async onModuleInit() {
    await this.kafkaClient.connect();
    this.logger.info({ type: 'startup', ...CTX }, 'Outbox poller connected to Kafka');
  }

  /** Run every 2 seconds — matches the TDD specification */
  @Cron('*/2 * * * * *')
  async poll() {
    await this.dataSource.transaction(async (em) => {
      const rows = await this.outboxRepo.findUnsentLocked(em);
      if (!rows.length) return;

      this.logger.debug({ type: 'outbox-poll', rowCount: rows.length, ...CTX }, `Outbox poll: processing ${rows.length} row(s)`);

      for (const row of rows) {
        try {
          /**
           * emit() publishes fire-and-forget.
           * The `event-id` header = row.id so consumers can deduplicate via
           * their inbox table.
           */
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
