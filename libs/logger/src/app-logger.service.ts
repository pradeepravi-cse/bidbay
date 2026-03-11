/* eslint-disable @typescript-eslint/no-explicit-any */

import { Injectable, LoggerService } from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { TraceContext, getTraceContext, readTraceIdFromHeaders } from './trace-context';

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

  // ─── HTTP Logging ──────────────────────────────────────────────────────────

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
    this.logger.error(
      {
        ...this.skeleton(req, ctx),
        method: req.method,
        path: req.url,
        type: 'error',
        status: res.statusCode,
        error: this.serializeError(error),
        durationMs,
      },
      'Request Error',
    );
  }

  // ─── Kafka Event Logging ───────────────────────────────────────────────────

  logKafkaIncoming(
    topic: string,
    eventId: string,
    payload: unknown,
    ctx?: LogContext,
  ) {
    this.logger.info({
      ...this.skeleton(undefined, ctx),
      type: 'kafka-incoming',
      message: `Kafka event received: ${topic}`,
      topic,
      eventId,
      payload,
    });
  }

  logKafkaDuplicate(topic: string, eventId: string, ctx?: LogContext) {
    this.logger.warn({
      ...this.skeleton(undefined, ctx),
      type: 'kafka-duplicate',
      message: `Duplicate Kafka event skipped: ${topic}`,
      topic,
      eventId,
    });
  }

  logKafkaSuccess(
    topic: string,
    eventId: string,
    result?: unknown,
    ctx?: LogContext,
  ) {
    this.logger.info({
      ...this.skeleton(undefined, ctx),
      type: 'kafka-success',
      message: `Kafka event processed: ${topic}`,
      topic,
      eventId,
      result,
    });
  }

  logKafkaError(
    topic: string,
    eventId: string,
    error: unknown,
    ctx?: LogContext,
  ) {
    this.logger.error(
      {
        ...this.skeleton(undefined, ctx),
        type: 'kafka-error',
        message: `Kafka event processing failed: ${topic}`,
        topic,
        eventId,
        error: this.serializeError(error),
      },
      `Kafka Error: ${topic}`,
    );
  }

  // ─── CQRS / Operation Logging ──────────────────────────────────────────────

  logOperationStart(operation: string, data?: unknown, ctx?: LogContext) {
    this.logger.info({
      ...this.skeleton(undefined, ctx),
      type: 'operation-start',
      message: `Operation started: ${operation}`,
      operation,
      data,
    });
  }

  logOperationSuccess(operation: string, result?: unknown, ctx?: LogContext) {
    this.logger.info({
      ...this.skeleton(undefined, ctx),
      type: 'operation-success',
      message: `Operation succeeded: ${operation}`,
      operation,
      result,
    });
  }

  logOperationError(operation: string, error: unknown, ctx?: LogContext) {
    this.logger.error(
      {
        ...this.skeleton(undefined, ctx),
        type: 'operation-error',
        message: `Operation failed: ${operation}`,
        operation,
        error: this.serializeError(error),
      },
      `Operation Error: ${operation}`,
    );
  }

  // ─── Outbox / Poller Logging ───────────────────────────────────────────────

  logOutboxPublished(eventType: string, rowId: string, ctx?: LogContext) {
    this.logger.debug({
      ...this.skeleton(undefined, ctx),
      type: 'outbox-published',
      message: `Outbox event published: ${eventType}`,
      eventType,
      rowId,
    });
  }

  logOutboxError(eventType: string, rowId: string, error: unknown, ctx?: LogContext) {
    this.logger.error(
      {
        ...this.skeleton(undefined, ctx),
        type: 'outbox-error',
        message: `Failed to publish outbox event: ${eventType}`,
        eventType,
        rowId,
        error: this.serializeError(error),
      },
      `Outbox Error: ${eventType}`,
    );
  }

  // ─── Generic Levels ────────────────────────────────────────────────────────

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

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private serializeError(error: unknown): unknown {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    return error;
  }
}
