import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';

import { APP_INTERCEPTOR } from '@nestjs/core';

import { LoggerInterceptor } from '../interceptors/logger.interceptor';
import { AppLogger } from './logger.service';
import {
  TRACE_ID_HEADER,
  readTraceIdFromHeaders,
  writeTraceIdHeader,
} from '../utils/traceContext';
import { TraceIdMiddleware } from '../middleware/trace-id.middleware';
import { AppController } from './app.controller';
import { OrdersModule } from '../orders/orders.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        name: 'bidbay',
        level: 'info',
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
    OrdersModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggerInterceptor,
    },
    AppLogger,
  ],
  exports: [AppLogger],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TraceIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
