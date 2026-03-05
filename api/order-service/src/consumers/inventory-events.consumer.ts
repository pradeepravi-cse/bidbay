/**
 * SAGA — CHOREOGRAPHY (Order Service side)
 * ─────────────────────────────────────────
 * In choreography-based SAGA there is NO central orchestrator.
 * Each service publishes events and reacts to events from other services.
 *
 * This consumer handles the two events the Inventory Service can produce:
 *   • inventory.reserved → SAGA happy path  → update order to CONFIRMED
 *   • inventory.failed   → SAGA compensation → update order to CANCELLED
 *
 * INBOX GUARD (idempotency)
 * ──────────────────────────
 * Kafka guarantees at-least-once delivery, so the same message CAN arrive
 * twice (broker retry, consumer rebalance). The inbox guard prevents double
 * processing by treating the eventId as a unique key.
 *
 * Full flow for inventory.reserved:
 *  1. Extract `event-id` from Kafka headers
 *  2. tryInsert(eventId) → if false: duplicate → return early
 *  3. BEGIN transaction
 *  4. UPDATE orders SET status = CONFIRMED WHERE id = orderId
 *  5. UPDATE inbox SET status = PROCESSED
 *  6. COMMIT
 */
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { InboxRepository } from '../repositories/inbox.repository';

@Controller()
export class InventoryEventsConsumer {
  private readonly logger = new Logger(InventoryEventsConsumer.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly inboxRepo: InboxRepository,
  ) {}

  // ── SAGA happy path ──────────────────────────────────────────────────────
  @EventPattern('inventory.reserved')
  async onInventoryReserved(
    @Payload() data: { orderId: string; reservedItems: { sku: string; quantity: number }[] },
    @Ctx() context: KafkaContext,
  ) {
    const eventId = this.extractEventId(context);
    if (!eventId) return;

    this.logger.log(`inventory.reserved received | orderId=${data.orderId} | eventId=${eventId}`);

    await this.dataSource.transaction(async (em) => {
      // Inbox guard: insert or bail if duplicate
      const isNew = await this.inboxRepo.tryInsert(em, eventId, 'inventory.reserved', 'inventory.reserved');
      if (!isNew) {
        this.logger.warn(`Duplicate event skipped: ${eventId}`);
        return;
      }

      // SAGA step: confirm the order
      await em.update(Order, { id: data.orderId }, {
        status:    OrderStatus.CONFIRMED,
        updatedAt: new Date(),
      });

      await this.inboxRepo.markProcessed(em, eventId);
    });
  }

  // ── SAGA compensation ─────────────────────────────────────────────────────
  @EventPattern('inventory.failed')
  async onInventoryFailed(
    @Payload() data: { orderId: string; reason: string },
    @Ctx() context: KafkaContext,
  ) {
    const eventId = this.extractEventId(context);
    if (!eventId) return;

    this.logger.log(`inventory.failed received | orderId=${data.orderId} | reason=${data.reason}`);

    await this.dataSource.transaction(async (em) => {
      const isNew = await this.inboxRepo.tryInsert(em, eventId, 'inventory.failed', 'inventory.failed');
      if (!isNew) {
        this.logger.warn(`Duplicate event skipped: ${eventId}`);
        return;
      }

      // SAGA compensation: cancel the order, record the reason
      await em.update(Order, { id: data.orderId }, {
        status:        OrderStatus.CANCELLED,
        failureReason: data.reason,
        updatedAt:     new Date(),
      });

      await this.inboxRepo.markProcessed(em, eventId);
    });
  }

  /**
   * Extract the `event-id` Kafka header (set by the outbox poller that
   * published this message). The value can arrive as a Buffer.
   */
  private extractEventId(context: KafkaContext): string | null {
    const headers = context.getMessage().headers ?? {};
    const raw = headers['event-id'];
    if (!raw) {
      this.logger.warn('Received Kafka message without event-id header — skipping');
      return null;
    }
    return Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  }
}
