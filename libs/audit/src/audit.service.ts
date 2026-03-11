import { Repository } from 'typeorm';

import { AppLogger } from '@bidbay/logger';

import { AuditLog } from './audit-log.entity';
import {
  AuditAction,
  AuditLevel,
  AuditModuleOptions,
  AuditOutcome,
  EntityAuditData,
  HttpAuditData,
} from './audit.types';

/**
 * Core audit service.
 *
 * No NestJS decorators (@Injectable, @InjectRepository, @Inject) by design.
 * This class is only ever instantiated by AuditModule's useFactory providers,
 * so NestJS never reads its design:paramtypes metadata.
 *
 * Adding any decorator here would cause TypeScript to emit design:paramtypes,
 * which NestJS would then try to resolve via constructor injection — and fail
 * because AuditModuleOptions is an interface (erased to Object at runtime).
 */
export class AuditService {
  constructor(
    private readonly repo: Repository<AuditLog> | undefined,
    private readonly logger: AppLogger,
    private readonly options: AuditModuleOptions,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  async logHttpAudit(data: HttpAuditData): Promise<void> {
    const entry = this.buildEntry({
      level: AuditLevel.HTTP,
      action: this.methodToAction(data.httpMethod),
      traceId: data.traceId,
      userId: data.userId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      httpMethod: data.httpMethod,
      httpPath: data.httpPath,
      httpStatusCode: data.httpStatusCode,
      requestBody: data.requestBody,
      requestQuery: data.requestQuery,
      durationMs: data.durationMs,
      outcome: data.outcome,
      errorMessage: data.errorMessage,
    });

    this.emitLog(entry, 'audit.http', 'HTTP Audit Trail');
    await this.persist(entry);
  }

  async logEntityAudit(data: EntityAuditData): Promise<void> {
    const entry = this.buildEntry({
      level: AuditLevel.ENTITY,
      action: data.action,
      traceId: data.traceId,
      userId: data.userId,
      entityType: data.entityType,
      entityId: data.entityId,
      beforeState: data.beforeState,
      afterState: data.afterState,
      diff: data.diff,
      outcome: data.outcome ?? AuditOutcome.SUCCESS,
      errorMessage: data.errorMessage,
    });

    this.emitLog(entry, 'audit.entity', 'Entity Audit Trail');
    await this.persist(entry);
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private buildEntry(fields: Partial<AuditLog>): Partial<AuditLog> {
    return {
      service: this.options.serviceName,
      outcome: AuditOutcome.SUCCESS,
      ...fields,
    };
  }

  private emitLog(entry: Partial<AuditLog>, type: string, msg: string): void {
    this.logger.log({ type, audit: entry }, msg);
  }

  private async persist(entry: Partial<AuditLog>): Promise<void> {
    if (!this.repo) return;
    try {
      await this.repo.save(this.repo.create(entry));
    } catch (err) {
      this.logger.error(
        { type: 'audit.persist-error', error: err },
        'Failed to persist audit log',
      );
    }
  }

  private methodToAction(method: string): AuditAction {
    switch (method.toUpperCase()) {
      case 'POST':
        return AuditAction.CREATE;
      case 'PUT':
      case 'PATCH':
        return AuditAction.UPDATE;
      case 'DELETE':
        return AuditAction.DELETE;
      case 'GET':
      default:
        return AuditAction.READ;
    }
  }
}
