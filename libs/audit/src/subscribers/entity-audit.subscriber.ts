/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DataSource,
  EntityMetadata,
  EntitySubscriberInterface,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';

import { getTraceContext } from '@bidbay/logger';

import { AuditLog } from '../audit-log.entity';
import { AuditService } from '../audit.service';
import { AuditAction, AuditModuleOptions } from '../audit.types';
import { computeDiff } from '../utils/diff.util';
import { sanitize } from '../utils/sanitize.util';

const noop = () => { /* swallow audit errors so they never break the request */ };

/**
 * TypeORM global event subscriber — entity-level audit trail.
 *
 * Created exclusively by AuditModule's useFactory and manually pushed into
 * dataSource.subscribers — NOT decorated with @Injectable() or @EventSubscriber()
 * to avoid NestJS / TypeORM auto-wiring that would attempt constructor-based
 * DI resolution.
 *
 * Hooks: beforeUpdate · afterInsert · afterUpdate · afterRemove
 * Recursion guard: AuditLog is always skipped.
 */
export class EntityAuditSubscriber implements EntitySubscriberInterface {
  /**
   * WeakMap stashes the pre-update snapshot keyed on the entity object
   * reference. Entries are GC'd automatically when the entity is released.
   */
  private readonly snapshots = new WeakMap<
    object,
    Record<string, unknown> | undefined
  >();

  constructor(
    dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly options: AuditModuleOptions,
  ) {
    dataSource.subscribers.push(this);
  }

  // ─── TypeORM hooks ─────────────────────────────────────────────────────────

  beforeUpdate(event: UpdateEvent<any>): void {
    if (!event.entity) return;
    this.snapshots.set(
      event.entity as object,
      event.databaseEntity ? this.toPlain(event.databaseEntity) : undefined,
    );
  }

  afterInsert(event: InsertEvent<any>): void {
    if (this.shouldSkip(event.metadata)) return;

    const ctx = getTraceContext();
    this.auditService
      .logEntityAudit({
        traceId: ctx.traceId,
        userId: ctx.userId,
        entityType: event.metadata.name,
        entityId: this.resolveId(event.entity, event.metadata),
        action: AuditAction.CREATE,
        afterState: sanitize(this.toPlain(event.entity), this.options.sensitiveFields),
      })
      .catch(noop);
  }

  afterUpdate(event: UpdateEvent<any>): void {
    if (this.shouldSkip(event.metadata)) return;
    if (!event.entity) return;

    const ctx = getTraceContext();
    const rawBefore = this.snapshots.get(event.entity as object);
    this.snapshots.delete(event.entity as object);

    const before = sanitize(rawBefore, this.options.sensitiveFields);
    const after = sanitize(this.toPlain(event.entity), this.options.sensitiveFields);

    this.auditService
      .logEntityAudit({
        traceId: ctx.traceId,
        userId: ctx.userId,
        entityType: event.metadata.name,
        entityId: this.resolveId(event.entity, event.metadata),
        action: AuditAction.UPDATE,
        beforeState: before,
        afterState: after,
        diff: computeDiff(before, after),
      })
      .catch(noop);
  }

  afterRemove(event: RemoveEvent<any>): void {
    if (this.shouldSkip(event.metadata)) return;

    const ctx = getTraceContext();
    this.auditService
      .logEntityAudit({
        traceId: ctx.traceId,
        userId: ctx.userId,
        entityType: event.metadata.name,
        entityId:
          this.resolveId(event.entity, event.metadata) ??
          String(event.entityId ?? ''),
        action: AuditAction.DELETE,
        beforeState: sanitize(this.toPlain(event.entity), this.options.sensitiveFields),
      })
      .catch(noop);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private shouldSkip(metadata: EntityMetadata | undefined): boolean {
    if (!metadata) return true;
    if (metadata.target === AuditLog || metadata.name === 'AuditLog') return true;
    return this.options.excludedEntities?.includes(metadata.name) ?? false;
  }

  private resolveId(
    entity: any,
    metadata: EntityMetadata | undefined,
  ): string | undefined {
    if (!entity || !metadata) return undefined;
    const cols = metadata.primaryColumns ?? [];
    if (cols.length === 0) return undefined;
    if (cols.length === 1) {
      const val = entity[cols[0].propertyName];
      return val != null ? String(val) : undefined;
    }
    const pkObj: Record<string, unknown> = {};
    for (const col of cols) pkObj[col.propertyName] = entity[col.propertyName];
    return JSON.stringify(pkObj);
  }

  private toPlain(entity: unknown): Record<string, unknown> {
    if (!entity || typeof entity !== 'object') return {};
    const plain: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entity as object)) {
      if (!k.startsWith('__')) plain[k] = v;
    }
    return plain;
  }
}
