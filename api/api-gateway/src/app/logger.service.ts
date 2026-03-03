/* eslint-disable @typescript-eslint/no-explicit-any */

import { Injectable, LoggerService } from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  TraceContext,
  getTraceContext,
  readTraceIdFromHeaders,
} from '../utils/traceContext';

export interface LogContext {
  service?: string;
  location?: string;
}

export interface RequestContext {
  headers?: NodeJS.Dict<string | string[] | undefined>;
  user?: {
    sub: string;
  };
  id?: string;
}

@Injectable()
export class AppLogger implements LoggerService {
  constructor(
    @InjectPinoLogger(PinoLogger.name) private readonly logger: PinoLogger,
  ) {}

  private resolveTraceId(
    request?: RequestContext,
    trace?: TraceContext,
  ): string | null {
    return (
      readTraceIdFromHeaders(request?.headers) ??
      request?.id ??
      trace?.traceId ??
      null
    );
  }

  private skeleton(req?: Request, ctx?: LogContext) {
    const request = (req as unknown as RequestContext) ?? {};
    const traceContext = getTraceContext();
    return {
      userid: request.user?.sub ?? traceContext.userId ?? null,
      path: req?.url ?? traceContext.path,
      service: ctx?.service,
      location: ctx?.location,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      ip: req?.ip ?? null,
      traceid: this.resolveTraceId(request, traceContext),
    };
  }

  logRequest(req: Request, ctx?: LogContext) {
    this.logger.info({
      ...this.skeleton(req, ctx),
      method: req.method,
      path: req.url,
      type: 'request',
      message: 'Incoming Request',
      query: req.query,
      body: { ...(req.body ?? {}) },
    });
  }

  logResponse(
    req: Request,
    res: Response,
    responseData: unknown,
    durationMs?: number,
    ctx?: LogContext,
  ) {
    this.logger.info({
      ...this.skeleton(req, ctx),
      method: req.method,
      path: req.url,
      type: 'response',
      message: 'Outgoing Response',
      status: res.statusCode,
      responseData,
      durationMs,
    });
  }

  logError(
    req: Request,
    res: Response,
    error: unknown,
    durationMs?: number,
    ctx?: LogContext,
  ) {
    this.logger.info(
      {
        ...this.skeleton(req, ctx),
        method: req.method,
        path: req.url,
        type: 'error',
        status: res.statusCode,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        durationMs,
      },
      'Request Error',
    );
  }

  log(obj: any, msg?: string) {
    this.logger.info({ ...this.skeleton(), ...obj }, msg);
  }
  info(obj: any, msg?: string) {
    this.logger.info({ ...this.skeleton(), ...obj }, msg);
  }

  debug(obj: any, msg?: string) {
    this.logger.debug({ ...this.skeleton(), ...obj }, msg);
  }

  warn(obj: any, msg?: string) {
    this.logger.warn({ ...this.skeleton(), ...obj }, msg);
  }

  error(obj: any, msg?: string) {
    this.logger.error({ ...this.skeleton(), ...obj }, msg);
  }
}
