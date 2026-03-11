import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';

import { LoggerModule, TraceIdMiddleware } from '@bidbay/logger';

import { AppController } from './app.controller';
import { OrdersModule } from '../orders/orders.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    LoggerModule.forService('api-gateway'),
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
