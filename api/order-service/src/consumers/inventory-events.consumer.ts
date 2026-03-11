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
import { Controller } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { InboxRepository } from '../repositories/inbox.repository';
import { AppLogger, setTraceContext } from '@bidbay/logger';

const CTX = { service: 'OrderService', location: 'InventoryEventsConsumer' };

@Controller()
export class InventoryEventsConsumer {
  constructor(
    private readonly dataSource: DataSource,
    private readonly inboxRepo: InboxRepository,
    private readonly logger: AppLogger,
  ) {}

  // ── SAGA happy path ──────────────────────────────────────────────────────
  @EventPattern('inventory.reserved')
  async onInventoryReserved(
    @Payload() data: { orderId: string; reservedItems: { sku: string; quantity: number }[] },
    @Ctx() context: KafkaContext,
  ) {
    const eventId = this.extractEventId(context);
    if (!eventId) return;

    setTraceContext({ traceId: eventId });

    this.logger.logKafkaIncoming('inventory.reserved', eventId, data, CTX);

    try {
      await this.dataSource.transaction(async (em) => {
        // Inbox guard: insert or bail if duplicate
        const isNew = await this.inboxRepo.tryInsert(em, eventId, 'inventory.reserved', 'inventory.reserved');
        if (!isNew) {
          this.logger.logKafkaDuplicate('inventory.reserved', eventId, CTX);
          return;
        }

        // SAGA step: confirm the order
        await em.update(Order, { id: data.orderId }, {
          status:    OrderStatus.CONFIRMED,
          updatedAt: new Date(),
        });

        await this.inboxRepo.markProcessed(em, eventId);
      });

      this.logger.logKafkaSuccess('inventory.reserved', eventId, { orderId: data.orderId, newStatus: OrderStatus.CONFIRMED }, CTX);
    } catch (err) {
      this.logger.logKafkaError('inventory.reserved', eventId, err, CTX);
      throw err;
    }
  }

  // ── SAGA compensation ─────────────────────────────────────────────────────
  @EventPattern('inventory.failed')
  async onInventoryFailed(
    @Payload() data: { orderId: string; reason: string },
    @Ctx() context: KafkaContext,
  ) {
    const eventId = this.extractEventId(context);
    if (!eventId) return;

    setTraceContext({ traceId: eventId });

    this.logger.logKafkaIncoming('inventory.failed', eventId, data, CTX);

    try {
      await this.dataSource.transaction(async (em) => {
        const isNew = await this.inboxRepo.tryInsert(em, eventId, 'inventory.failed', 'inventory.failed');
        if (!isNew) {
          this.logger.logKafkaDuplicate('inventory.failed', eventId, CTX);
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

      this.logger.logKafkaSuccess('inventory.failed', eventId, { orderId: data.orderId, newStatus: OrderStatus.CANCELLED, reason: data.reason }, CTX);
    } catch (err) {
      this.logger.logKafkaError('inventory.failed', eventId, err, CTX);
      throw err;
    }
  }

  /**
   * Extract the `event-id` Kafka header (set by the outbox poller that
   * published this message). The value can arrive as a Buffer.
   */
  private extractEventId(context: KafkaContext): string | null {
    const headers = context.getMessage().headers ?? {};
    const raw = headers['event-id'];
    if (!raw) {
      this.logger.warn(
        { type: 'kafka-missing-header', header: 'event-id', ...CTX },
        'Received Kafka message without event-id header — skipping',
      );
      return null;
    }
    return Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  }
}
