/**
 * OUTBOX PATTERN — Inventory Service
 * ────────────────────────────────────
 * The Inventory Service writes here (in the SAME DB transaction as the stock
 * update) whenever it needs to emit an event.
 *
 * Events produced: inventory.reserved | inventory.failed
 *
 * A background poller (every 2 s) reads UNSENT rows and publishes them to
 * Kafka, then marks them SENT. This decouples the HTTP response from the Kafka
 * publish and guarantees at-least-once delivery even if the broker is
 * temporarily unreachable.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum OutboxStatus {
  UNSENT = 'UNSENT',
  SENT   = 'SENT',
  FAILED = 'FAILED',
}

@Entity('inventory_outbox')
export class InventoryOutbox {
  /** Used as the Kafka `event-id` header so consumers can deduplicate */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  aggregateId: string; // the orderId that triggered this event

  @Column()
  aggregateType: string; // 'Inventory'

  @Column()
  eventType: string; // 'inventory.reserved' | 'inventory.failed'

  @Column('jsonb')
  payload: Record<string, unknown>;

  @Column({ type: 'enum', enum: OutboxStatus, default: OutboxStatus.UNSENT })
  status: OutboxStatus;

  @Column({ default: 0 })
  retryCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  sentAt: Date | null;
}
