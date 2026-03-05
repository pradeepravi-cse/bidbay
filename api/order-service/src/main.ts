/**
 * Order Service Bootstrap
 * ────────────────────────
 * HYBRID APPLICATION
 * ──────────────────
 * NestJS supports "hybrid" apps — they serve BOTH HTTP and one or more
 * microservice transports simultaneously.
 *
 * Here we attach a Kafka consumer microservice alongside the HTTP server:
 *   • HTTP (port 3001) — handles REST calls from the API Gateway
 *   • Kafka consumer   — listens on inventory.reserved + inventory.failed
 *
 * The @EventPattern handlers in InventoryEventsConsumer are registered on the
 * Kafka transport; regular @Get/@Post handlers are on the HTTP transport.
 *
 * app.startAllMicroservices() must be called BEFORE app.listen() so the Kafka
 * consumer is ready to receive messages as soon as the service is healthy.
 */
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Kafka consumer (SAGA listener) ────────────────────────────────────────
  /**
   * groupId 'order-service':
   *   - All pods of this service share the same group, so Kafka load-balances
   *     partitions across pods — each message is processed by ONE pod only.
   *   - If you used a unique groupId per pod, every pod would consume every
   *     message (fan-out), which is wrong for SAGA.
   */
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId:              'order-service-consumer',
        brokers:               (process.env.KAFKA_BROKERS ?? '192.168.0.115:9092').split(','),
        allowAutoTopicCreation: true,
      },
      consumer: {
        groupId: 'order-service',
      },
    },
  });

  // ── HTTP server ───────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Start the Kafka consumer FIRST so it is ready before HTTP traffic arrives
  await app.startAllMicroservices();

  const port = process.env.ORDER_SERVICE_PORT ?? 3001;
  await app.listen(port);

  Logger.log(`Order Service HTTP  → http://localhost:${port}/api`);
  Logger.log(`Order Service Kafka → consuming: inventory.reserved, inventory.failed`);
}

bootstrap().catch((err) => {
  Logger.error('Order Service failed to start', err);
  process.exit(1);
});
