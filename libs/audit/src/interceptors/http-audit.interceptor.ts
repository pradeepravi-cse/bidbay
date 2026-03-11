import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { getTraceContext } from '@bidbay/logger';

import { AuditService } from '../audit.service';
import { AuditModuleOptions, AuditOutcome } from '../audit.types';
import { sanitize } from '../utils/sanitize.util';

/**
 * HTTP-level audit interceptor.
 *
 * Created exclusively by AuditModule's useFactory — NOT decorated with
 * @Injectable() to avoid NestJS reading design:paramtypes and attempting
 * constructor-based DI resolution.
 */
export class HttpAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly options: AuditModuleOptions,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // Skip non-HTTP contexts (Kafka @EventPattern handlers, etc.)
    if (!req || !req.method) return next.handle();

    // Skip explicitly excluded path prefixes
    if (this.options.excludedPaths?.some((p) => req.path.startsWith(p))) {
      return next.handle();
    }

    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.capture(req, res, start, AuditOutcome.SUCCESS).catch(() => {
          /* swallow — audit must never break the response */
        });
      }),
      catchError((err: unknown) => {
        this.capture(req, res, start, AuditOutcome.ERROR, err).catch(() => {});
        return throwError(() => err);
      }),
    );
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async capture(
    req: Request,
    res: Response,
    start: number,
    outcome: AuditOutcome,
    err?: unknown,
  ): Promise<void> {
    const ctx = getTraceContext();

    const userId =
      (req.headers['x-user-id'] as string | undefined) ?? ctx.userId;

    const ipAddress =
      req.ip ??
      (req.socket?.remoteAddress as string | undefined) ??
      (req.headers['x-forwarded-for'] as string | undefined);

    await this.auditService.logHttpAudit({
      traceId: ctx.traceId,
      userId,
      ipAddress,
      userAgent: req.headers['user-agent'],
      httpMethod: req.method,
      httpPath: req.path,
      httpStatusCode: res.statusCode || (err ? 500 : 200),
      requestBody: sanitize(
        req.body as Record<string, unknown>,
        this.options.sensitiveFields,
      ),
      requestQuery: req.query as Record<string, unknown>,
      durationMs: Date.now() - start,
      outcome,
      errorMessage:
        err instanceof Error
          ? err.message
          : err
            ? String(err)
            : undefined,
    });
  }
}
