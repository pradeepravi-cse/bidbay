/**
 * CQRS — COMMAND HANDLER
 * ──────────────────────
 * The handler is the only place that knows HOW to fulfil a command.
 * It co-ordinates repositories, enforces business rules, and in this case
 * also implements the OUTBOX PATTERN for reliable messaging.
 *
 * OUTBOX PATTERN (why it matters)
 * ────────────────────────────────
 * Naïve approach: save order → publish to Kafka.
 * Problem: the service crashes between the save and the publish → the event
 * is lost, inventory is never reserved, order stays PENDING forever.
 *
 * Outbox approach:
 *  1. BEGIN transaction
 *  2. INSERT order (status = PENDING)
 *  3. INSERT outbox row (status = UNSENT, eventType = 'order.created')
 *  4. COMMIT  ← both are atomic; either both succeed or both roll back
 *  5. A separate OutboxPoller reads UNSENT rows and publishes to Kafka.
 *
 * Now if the service crashes after COMMIT, the poller will pick up the row
 * on restart. The event is NEVER lost.
 *
 * SOLID principles applied here:
 *  S — this class only handles PlaceOrderCommand; nothing else.
 *  D — it depends on OrderRepository/OutboxRepository abstractions, not TypeORM
 *      EntityManager directly.
 */
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PlaceOrderCommand } from '../place-order.command';
import { OrderRepository } from '../../repositories/order.repository';
import { OutboxRepository } from '../../repositories/outbox.repository';
import { DataSource } from 'typeorm';
import { Order, OrderStatus, OrderItem } from '../../entities/order.entity';
import { Outbox, OutboxStatus } from '../../entities/order-outbox.entity';

export interface PlaceOrderResult {
  orderId: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: Date;
}

@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand, PlaceOrderResult> {
  constructor(
    private readonly dataSource: DataSource,
    // Repositories are thin wrappers — they isolate the DB concern from the handler.
    private readonly orderRepo: OrderRepository,
    private readonly outboxRepo: OutboxRepository,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
    const { userId, items } = command;

    // Calculate total: sum(quantity × price) for every item
    const totalAmount = items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0,
    );

    // ── OUTBOX PATTERN: atomic double-insert ─────────────────────────────────
    return this.dataSource.transaction(async (em) => {
      // Step 1: persist the order
      const order = em.create(Order, {
        userId,
        items,
        totalAmount,
        status: OrderStatus.PENDING,
      });
      await em.save(Order, order);

      // Step 2: write the outbox event IN THE SAME TRANSACTION
      // eventType becomes the Kafka topic name.
      const outbox = em.create(Outbox, {
        aggregateId: order.id,
        aggregateType: 'Order',
        eventType: 'order.created',
        status: OutboxStatus.UNSENT,
        payload: {
          orderId:     order.id,
          userId:      order.userId,
          items:       order.items,
          totalAmount: order.totalAmount,
        } as Record<string, unknown>,
      });
      await em.save(Outbox, outbox);

      // Return the 202-response body — minimal acknowledgement only.
      return {
        orderId:     order.id,
        status:      order.status,
        totalAmount: Number(order.totalAmount),
        createdAt:   order.createdAt,
      };
    });
  }
}
