import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';

import { LoggerModule, TraceIdMiddleware } from '@bidbay/logger';
import { AuditModule } from '@bidbay/audit';

import { AppController } from './app.controller';
import { OrdersModule } from '../orders/orders.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    LoggerModule.forService('api-gateway'),
    // HTTP-level audit trail only — gateway has no DB so persistToDb=false.
    // Entries are emitted as structured pino log lines (type: 'audit.http').
    AuditModule.forService('api-gateway', { persistToDb: false }),
    OrdersModule,
    InventoryModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TraceIdMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
