import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction, AuditLevel, AuditOutcome } from './audit.types';

/**
 * Persisted audit record.
 *
 * One record per significant event:
 *  - HTTP  → every inbound HTTP request that reaches a handler
 *  - ENTITY → every INSERT / UPDATE / DELETE that TypeORM executes
 *
 * Indexed for the most common query patterns:
 *  - "Show me all actions by user X"  → userId + createdAt
 *  - "Show me the history of order Y" → entityType + entityId
 *  - "Correlate logs for trace Z"     → traceId
 */
@Entity('audit_logs')
@Index('idx_audit_user_time', ['userId', 'createdAt'])
@Index('idx_audit_entity', ['entityType', 'entityId'])
@Index('idx_audit_trace', ['traceId'])
@Index('idx_audit_level_action', ['level', 'action'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── Context ──────────────────────────────────────────────────────────────

  /** Originating microservice (e.g. 'order-service', 'inventory-service'). */
  @Column({ length: 100 })
  service: string;

  /** Propagated x-trace-id for cross-service correlation. */
  @Column({ nullable: true, length: 36 })
  traceId: string;

  // ─── Who ──────────────────────────────────────────────────────────────────

  /** Authenticated user performing the action (null for system/async events). */
  @Column({ nullable: true, length: 36 })
  userId: string;

  /** Client IP address (HTTP level only). */
  @Column({ nullable: true, length: 45 })
  ipAddress: string;

  /** User-Agent header (HTTP level only). */
  @Column({ nullable: true, length: 512 })
  userAgent: string;

  // ─── What ─────────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 20 })
  level: AuditLevel;

  @Column({ type: 'varchar', length: 20 })
  action: AuditAction;

  @Column({ type: 'varchar', length: 20, default: AuditOutcome.SUCCESS })
  outcome: AuditOutcome;

  // ─── HTTP fields (populated for level = HTTP) ─────────────────────────────

  @Column({ nullable: true, length: 10 })
  httpMethod: string;

  @Column({ nullable: true, length: 2048 })
  httpPath: string;

  @Column({ type: 'smallint', nullable: true })
  httpStatusCode: number;

  /** Request body with sensitive fields redacted. */
  @Column({ type: 'jsonb', nullable: true })
  requestBody: Record<string, unknown>;

  /** Query-string parameters. */
  @Column({ type: 'jsonb', nullable: true })
  requestQuery: Record<string, unknown>;

  /** End-to-end latency in milliseconds. */
  @Column({ type: 'int', nullable: true })
  durationMs: number;

  // ─── Entity fields (populated for level = ENTITY) ─────────────────────────

  /** TypeORM entity metadata name (e.g. 'Order', 'Inventory'). */
  @Column({ nullable: true, length: 100 })
  entityType: string;

  /** Primary key value of the affected entity. */
  @Column({ nullable: true, length: 36 })
  entityId: string;

  /** Complete entity snapshot before the mutation (UPDATE / DELETE). */
  @Column({ type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown>;

  /** Complete entity snapshot after the mutation (INSERT / UPDATE). */
  @Column({ type: 'jsonb', nullable: true })
  afterState: Record<string, unknown>;

  /**
   * Field-level diff between beforeState and afterState.
   * Shape: { fieldName: { before: oldValue, after: newValue } }
   */
  @Column({ type: 'jsonb', nullable: true })
  diff: Record<string, unknown>;

  // ─── Error info ───────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  // ─── Timestamp ────────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt: Date;
}
