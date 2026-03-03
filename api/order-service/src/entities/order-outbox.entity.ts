import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum OutboxStatus {
  UNSENT = 'UNSENT',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('outbox')
export class Outbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  aggregateId: string; // orderId — which entity triggered this

  @Column()
  aggregateType: string; // 'Order'

  @Column()
  eventType: string; // 'order.created'

  @Column('jsonb')
  payload: Record<string, any>;

  @Column({ type: 'enum', enum: OutboxStatus, default: OutboxStatus.UNSENT })
  status: OutboxStatus;

  @Column({ default: 0 })
  retryCount: number; // incremented on failed publish attempts

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  sentAt: Date;
}
