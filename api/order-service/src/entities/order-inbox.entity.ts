/**
 * INBOX PATTERN
 * ─────────────
 * Every Kafka message the Order Service consumes is first recorded here BEFORE
 * any business logic runs. This gives us two guarantees:
 *
 * 1. IDEMPOTENCY: if Kafka re-delivers the same message (at-least-once
 *    semantics), the UNIQUE constraint on `eventId` prevents double-processing.
 *
 * 2. OBSERVABILITY: you can inspect this table to see exactly which events
 *    were received and whether they succeeded or failed.
 *
 * The Order Service consumes: inventory.reserved | inventory.failed
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

@Entity('order_inbox')
export class OrderInbox {
  /**
   * The `event-id` Kafka header value. Acts as primary key so the DB itself
   * enforces uniqueness — even under concurrent consumers the second INSERT
   * will throw a unique-violation which we catch and treat as a duplicate.
   */
  @PrimaryColumn('uuid')
  eventId: string;

  @Column()
  topic: string; // 'inventory.reserved' | 'inventory.failed'

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
