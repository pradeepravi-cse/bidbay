/**
 * Order Service — Root Module
 * ────────────────────────────
 * Assembles all the pieces. Think of this as the DI wiring diagram.
 *
 * KEY IMPORTS EXPLAINED
 * ──────────────────────
 * ConfigModule        – reads .env so every service can use process.env safely
 * TypeOrmModule       – connects to PostgreSQL; synchronize:true auto-creates
 *                       tables in dev (use migrations in production)
 * CqrsModule          – registers CommandBus and QueryBus
 * ScheduleModule      – enables @Cron decorators (used by OutboxPoller)
 * ClientsModule       – registers a Kafka producer client (used by OutboxPoller
 *                       to emit events) — this is separate from the Kafka
 *                       consumer (which is set up in main.ts via connectMicroservice)
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { LoggerModule } from '@bidbay/logger';

import { AppController } from './app.controller';

// Entities
import { Order } from '../entities/order.entity';
import { Outbox } from '../entities/order-outbox.entity';
import { OrderInbox } from '../entities/order-inbox.entity';

// Command handlers
import { PlaceOrderHandler } from '../commands/handlers/place-order.handler';

// Query handlers
import { GetOrderByIdHandler } from '../queries/handlers/get-order-by-id.handler';
import { GetOrdersByUserHandler } from '../queries/handlers/get-orders-by-user.handler';

// Repositories
import { OrderRepository } from '../repositories/order.repository';
import { OutboxRepository } from '../repositories/outbox.repository';
import { InboxRepository } from '../repositories/inbox.repository';

// Kafka consumer (SAGA listener)
import { InventoryEventsConsumer } from '../consumers/inventory-events.consumer';

// Outbox poller
import { OutboxPollerService } from '../outbox/outbox-poller.service';

const COMMAND_HANDLERS = [PlaceOrderHandler];
const QUERY_HANDLERS   = [GetOrderByIdHandler, GetOrdersByUserHandler];

@Module({
  imports: [
    // Load .env globally so process.env is populated everywhere
    ConfigModule.forRoot({ isGlobal: true }),

    // Structured JSON logging with trace ID propagation
    LoggerModule.forService('order-service'),

    // PostgreSQL connection — uses env vars set in .env
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type:        'postgres' as const,
        host:        process.env.DB_HOST        ?? 'localhost',
        port:        Number(process.env.DB_PORT ?? 5432),
        username:    process.env.DB_USER        ?? 'postgres',
        password:    process.env.DB_PASS        ?? 'postgres',
        database:    process.env.ORDER_DB_NAME  ?? 'order_service',
        entities:    [Order, Outbox, OrderInbox],
        // In dev, TypeORM auto-creates / alters tables to match entities.
        // NEVER use synchronize:true in production — use migrations instead.
        synchronize: process.env.NODE_ENV !== 'production',
        logging:     ['error'] as const,
      }),
    }),

    // Enables CommandBus and QueryBus
    CqrsModule,

    // Enables @Cron() scheduling for the outbox poller
    ScheduleModule.forRoot(),

    /**
     * KAFKA PRODUCER CLIENT
     * ──────────────────────
     * This is used by OutboxPollerService to emit events.
     * It is NOT the same as the Kafka consumer — the consumer is wired via
     * app.connectMicroservice() in main.ts.
     *
     * clientId: identifies this producer in Kafka broker logs
     */
    ClientsModule.register([
      {
        name:      'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId:              'order-service-producer',
            brokers:               (process.env.KAFKA_BROKERS ?? '192.168.0.115:9092').split(','),
            allowAutoTopicCreation: true,
          },
          producer: {},
        },
      },
    ]),
  ],

  controllers: [
    AppController,
    // The Kafka consumer controller — NestJS registers @EventPattern handlers here
    InventoryEventsConsumer,
  ],

  providers: [
    // CQRS handlers — the bus discovers these by their @CommandHandler/@QueryHandler decorator
    ...COMMAND_HANDLERS,
    ...QUERY_HANDLERS,

    // Repositories
    OrderRepository,
    OutboxRepository,
    InboxRepository,

    // Outbox poller
    OutboxPollerService,
  ],
})
export class AppModule {}
