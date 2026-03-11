import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';

import { AppLogger } from './app-logger.service';
import { LoggerInterceptor } from './logger.interceptor';
import { TraceIdMiddleware } from './trace-id.middleware';
import { TRACE_ID_HEADER, readTraceIdFromHeaders, writeTraceIdHeader } from './trace-context';

export interface LoggerModuleOptions {
  /** Human-readable service name included in every log line */
  serviceName: string;
  /** Minimum log level (default: 'info') */
  level?: string;
}

@Module({})
export class LoggerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TraceIdMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }

  static forService(serviceName: string, options?: Omit<LoggerModuleOptions, 'serviceName'>): DynamicModule {
    const level = options?.level ?? process.env.LOG_LEVEL ?? 'info';

    return {
      module: LoggerModule,
      global: true,
      imports: [
        PinoLoggerModule.forRoot({
          pinoHttp: {
            name: serviceName,
            level,
            genReqId: (req, res) => {
              const existingTraceId = readTraceIdFromHeaders(req.headers);
              const traceId = existingTraceId ?? randomUUID();

              req.id = traceId;
              writeTraceIdHeader(req.headers, traceId);

              if (res) {
                res.setHeader(TRACE_ID_HEADER, traceId);
              }

              return traceId;
            },
          },
        }),
      ],
      providers: [
        AppLogger,
        {
          provide: APP_INTERCEPTOR,
          useClass: LoggerInterceptor,
        },
      ],
      exports: [AppLogger],
    };
  }
}
