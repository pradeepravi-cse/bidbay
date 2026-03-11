/**
 * Inventory Service — Root Module
 * ─────────────────────────────────
 * Mirror of the Order Service module — same patterns, different entities.
 *
 * DATABASE: inventory_service  (separate DB per microservice — shared-nothing)
 * KAFKA consumer group: 'inventory-service'  (consumes order.created)
 * KAFKA producer: used by OutboxPollerService to emit inventory.reserved / .failed
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
import { Inventory } from '../entities/inventory.entity';
import { InventoryOutbox } from '../entities/inventory-outbox.entity';
import { InventoryInbox } from '../entities/inventory-inbox.entity';

// Command handlers
import { CreateInventoryHandler } from '../commands/handlers/create-inventory.handler';
import { UpdateInventoryHandler } from '../commands/handlers/update-inventory.handler';

// Query handlers
import { GetAllInventoryHandler } from '../queries/handlers/get-all-inventory.handler';
import { GetInventoryBySkuHandler } from '../queries/handlers/get-inventory-by-sku.handler';

// Repositories
import { InventoryRepository } from '../repositories/inventory.repository';
import { OutboxRepository } from '../repositories/outbox.repository';
import { InboxRepository } from '../repositories/inbox.repository';

// Kafka consumer (SAGA listener)
import { OrderEventsConsumer } from '../consumers/order-events.consumer';

// Outbox poller
import { OutboxPollerService } from '../outbox/outbox-poller.service';

const COMMAND_HANDLERS = [CreateInventoryHandler, UpdateInventoryHandler];
const QUERY_HANDLERS = [GetAllInventoryHandler, GetInventoryBySkuHandler];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Structured JSON logging with trace ID propagation
    LoggerModule.forService('inventory-service'),

    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASS ?? 'postgres',
        database: process.env.INVENTORY_DB_NAME ?? 'inventory_service',
        entities: [Inventory, InventoryOutbox, InventoryInbox],
        synchronize: process.env.NODE_ENV !== 'production',
        logging: ['error'] as const,
      }),
    }),

    CqrsModule,
    ScheduleModule.forRoot(),

    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'inventory-service-producer',
            brokers: (process.env.KAFKA_BROKERS ?? '192.168.0.115:9092').split(
              ',',
            ),
            allowAutoTopicCreation: true,
          },
          producer: {},
        },
      },
    ]),
  ],

  controllers: [AppController, OrderEventsConsumer],

  providers: [
    ...COMMAND_HANDLERS,
    ...QUERY_HANDLERS,

    InventoryRepository,
    OutboxRepository,
    InboxRepository,

    OutboxPollerService,
  ],
})
export class AppModule {}
