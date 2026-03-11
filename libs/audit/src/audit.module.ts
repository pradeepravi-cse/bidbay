import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AppLogger } from '@bidbay/logger';

import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { HttpAuditInterceptor } from './interceptors/http-audit.interceptor';
import { EntityAuditSubscriber } from './subscribers/entity-audit.subscriber';
import { AuditModuleOptions } from './audit.types';

export { AUDIT_MODULE_OPTIONS } from './audit.constants';

/**
 * Shared audit module — call `AuditModule.forService()` in each service's
 * AppModule after `LoggerModule.forService()`.
 *
 * All options are captured in factory closures so no custom injection token
 * is passed through `@Inject()` decorators (avoids reflect-metadata issues
 * with string tokens and CommonJS module load ordering).
 *
 * @example  Microservice  (TypeORM available) — HTTP + entity audit, DB-persisted
 * AuditModule.forService('order-service')
 *
 * @example  API Gateway  (no TypeORM) — HTTP audit only, emitted as pino logs
 * AuditModule.forService('api-gateway', { persistToDb: false })
 */
@Module({})
export class AuditModule {
  static forService(
    serviceName: string,
    options?: Omit<AuditModuleOptions, 'serviceName'>,
  ): DynamicModule {
    const opts: AuditModuleOptions = {
      persistToDb: true,
      ...options,
      serviceName,
    };

    const persistToDb = opts.persistToDb !== false;

    // ── AuditService factory ──────────────────────────────────────────────────
    // Two separate factory shapes to avoid argument-position mismatch when the
    // repository is not injected (persistToDb=false / gateway mode).
    const auditServiceProvider = persistToDb
      ? {
          provide: AuditService,
          useFactory: (
            repo: Repository<AuditLog> | undefined,
            logger: AppLogger,
          ) => new AuditService(repo, logger, opts),
          inject: [
            { token: getRepositoryToken(AuditLog), optional: true },
            AppLogger,
          ],
        }
      : {
          provide: AuditService,
          useFactory: (logger: AppLogger) =>
            new AuditService(undefined, logger, opts),
          inject: [AppLogger],
        };

    // ── HttpAuditInterceptor factory ──────────────────────────────────────────
    const httpInterceptorProvider = {
      provide: APP_INTERCEPTOR,
      useFactory: (auditService: AuditService) =>
        new HttpAuditInterceptor(auditService, opts),
      inject: [AuditService],
    };

    // ── EntityAuditSubscriber factory  (microservices only) ───────────────────
    const entitySubscriberProvider = {
      provide: EntityAuditSubscriber,
      useFactory: (dataSource: DataSource, auditService: AuditService) =>
        new EntityAuditSubscriber(dataSource, auditService, opts),
      inject: [DataSource, AuditService],
    };

    return {
      module: AuditModule,
      global: true,
      imports: persistToDb ? [TypeOrmModule.forFeature([AuditLog])] : [],
      providers: [
        auditServiceProvider,
        httpInterceptorProvider,
        ...(persistToDb ? [entitySubscriberProvider] : []),
      ],
      exports: [AuditService],
    };
  }
}
