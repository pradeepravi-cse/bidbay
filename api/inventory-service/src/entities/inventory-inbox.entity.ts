/**
 * INBOX PATTERN — Inventory Service
 * ───────────────────────────────────
 * The Inventory Service consumes `order.created` events from Kafka.
 * Before running any business logic, it records the event here.
 *
 * The PrimaryColumn on `eventId` (= Kafka `event-id` header) gives us a
 * natural unique constraint: a duplicate delivery will fail the INSERT,
 * which we catch and treat as an idempotent no-op.
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum InboxStatus {
  UNPROCESSED = 'UNPROCESSED',
  PROCESSED   = 'PROCESSED',
  FAILED      = 'FAILED',
}

@Entity('inventory_inbox')
export class InventoryInbox {
  @PrimaryColumn('uuid')
  eventId: string;

  @Column()
  topic: string; // 'order.created'

  @Column()
  eventType: string;

  @Column({ type: 'enum', enum: InboxStatus, default: InboxStatus.UNPROCESSED })
  status: InboxStatus;

  @Column({ nullable: true, type: 'text' })
  failureReason: string | null;

  @CreateDateColumn()
  receivedAt: Date;

  @Column({ nullable: true })
  processedAt: Date | null;
}
