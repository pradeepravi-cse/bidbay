/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from 'nestjs-pino';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(
    {
      type: 'startup',
      service: 'bootstrap',
      location: 'bootstrap',
      url: `http://0.0.0.0:${port}`,
      environment: process.env.NODE_ENV,
    },
    'Application Started',
  );
}

bootstrap().catch((error) => {
  console.error('Bootstrap failed', error);
  process.exit(1);
});
