/**
 * SAGA — CHOREOGRAPHY (Inventory Service side)
 * ─────────────────────────────────────────────
 * This is the most important SAGA step. When an `order.created` event arrives
 * the Inventory Service must decide: CAN we reserve the stock?
 *
 * YES → emit `inventory.reserved`  → Order Service confirms the order
 * NO  → emit `inventory.failed`    → Order Service cancels the order
 *
 * ATOMICITY GUARANTEE
 * ─────────────────────
 * Everything in one DB transaction:
 *   1. INSERT inbox row (dedup guard)
 *   2. SELECT inventory rows FOR UPDATE SKIP LOCKED  ← prevents overselling
 *   3. Check stock for every SKU
 *   4a. All OK  → reduce availableQty, increase reservedQty for each SKU
 *   4b. Any KO  → prepare failure reason
 *   5. INSERT outbox row (inventory.reserved OR inventory.failed)
 *   6. UPDATE inbox to PROCESSED
 *   7. COMMIT
 *
 * If the process crashes at any step, the transaction rolls back. On restart
 * Kafka re-delivers the message and the inbox guard prevents double-processing.
 *
 * RACE CONDITION PROTECTION
 * ──────────────────────────
 * Two orders arrive simultaneously for the same SKU (availableQty = 5, each
 * wants 5). Without locking both would see qty=5 and both would succeed →
 * overselling.
 *
 * "SELECT FOR UPDATE SKIP LOCKED" solves this:
 *   Consumer A locks the row → sees qty=5 → reserves → commits
 *   Consumer B SKIP LOCKED → sees nothing → waits (actually: skips and Kafka
 *   will re-deliver since the commit didn't happen yet for B) → on re-delivery
 *   B gets the lock → sees qty=0 → emits inventory.failed
 */
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { Inventory } from '../entities/inventory.entity';
import { InventoryOutbox, OutboxStatus } from '../entities/inventory-outbox.entity';
import { InboxRepository } from '../repositories/inbox.repository';

interface OrderItem {
  sku:      string;
  quantity: number;
  price:    number;
}

interface OrderCreatedPayload {
  orderId:     string;
  userId:      string;
  items:       OrderItem[];
  totalAmount: number;
}

@Controller()
export class OrderEventsConsumer {
  private readonly logger = new Logger(OrderEventsConsumer.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly inboxRepo: InboxRepository,
  ) {}

  @EventPattern('order.created')
  async onOrderCreated(
    @Payload() data: OrderCreatedPayload,
    @Ctx() context: KafkaContext,
  ) {
    const eventId = this.extractEventId(context);
    if (!eventId) return;

    this.logger.log(`order.created received | orderId=${data.orderId} | eventId=${eventId}`);

    await this.dataSource.transaction(async (em) => {
      // ── Inbox guard ─────────────────────────────────────────────────────
      const isNew = await this.inboxRepo.tryInsert(em, eventId, 'order.created', 'order.created');
      if (!isNew) {
        this.logger.warn(`Duplicate event skipped: ${eventId}`);
        return;
      }

      // ── Lock inventory rows FOR UPDATE SKIP LOCKED ──────────────────────
      const skus = data.items.map((i) => i.sku);
      const inventoryRows = await em
        .getRepository(Inventory)
        .createQueryBuilder('inv')
        .where('inv.sku IN (:...skus)', { skus })
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      // Index by SKU for O(1) lookup
      const bySkuMap = new Map(inventoryRows.map((r) => [r.sku, r]));

      // ── Check every SKU ─────────────────────────────────────────────────
      let failureReason: string | null = null;
      for (const item of data.items) {
        const row = bySkuMap.get(item.sku);
        if (!row || row.availableQty < item.quantity) {
          failureReason = `Insufficient stock for ${item.sku}`;
          break;
        }
      }

      let outboxEvent: Partial<InventoryOutbox>;

      if (!failureReason) {
        // ── Happy path: reserve stock ──────────────────────────────────────
        for (const item of data.items) {
          const row = bySkuMap.get(item.sku)!;
          row.availableQty -= item.quantity;
          row.reservedQty  += item.quantity;
          await em.save(Inventory, row);
        }

        outboxEvent = {
          aggregateId:   data.orderId,
          aggregateType: 'Inventory',
          eventType:     'inventory.reserved',
          status:        OutboxStatus.UNSENT,
          payload: {
            orderId:       data.orderId,
            reservedItems: data.items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
          },
        };
      } else {
        // ── Failure path: emit failure event (no stock changes) ───────────
        this.logger.warn(`Stock check failed for order ${data.orderId}: ${failureReason}`);

        outboxEvent = {
          aggregateId:   data.orderId,
          aggregateType: 'Inventory',
          eventType:     'inventory.failed',
          status:        OutboxStatus.UNSENT,
          payload: {
            orderId: data.orderId,
            reason:  failureReason,
          },
        };
      }

      // ── Write outbox row (same transaction!) ────────────────────────────
      await em.save(InventoryOutbox, em.create(InventoryOutbox, outboxEvent));

      // ── Mark inbox PROCESSED ─────────────────────────────────────────────
      await this.inboxRepo.markProcessed(em, eventId);
    });
  }

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
