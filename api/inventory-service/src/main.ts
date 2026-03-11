/**
 * Inventory Service Bootstrap
 * ────────────────────────────
 * Hybrid app: HTTP on port 3002 + Kafka consumer (group: inventory-service)
 *
 * Consumer group 'inventory-service' ensures that in a scaled deployment
 * (multiple pods) each `order.created` message is processed by exactly ONE
 * pod — Kafka distributes partitions across the group.
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // ── Kafka consumer ────────────────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'inventory-service-consumer',
        brokers: (process.env.KAFKA_BROKERS ?? '192.168.0.115:9092').split(','),
        allowAutoTopicCreation: true,
      },
      consumer: {
        groupId: 'inventory-service',
      },
    },
  });

  // ── HTTP server ───────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useLogger(app.get(Logger));
  app.flushLogs();

  await app.startAllMicroservices();

  const port = process.env.INVENTORY_SERVICE_PORT ?? 3002;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(
    {
      type: 'startup',
      service: 'inventory-service',
      location: 'bootstrap',
      url: `http://localhost:${port}/api`,
      environment: process.env.NODE_ENV,
    },
    'Inventory Service Started',
  );
}

bootstrap().catch((err) => {
  console.error('Inventory Service failed to start', err);
  process.exit(1);
});
