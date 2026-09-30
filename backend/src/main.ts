import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { PrismaInitExceptionFilter } from './common/filters/prisma-init-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  // Disable Nest's built-in body parser so we can register our own with a
  // larger limit (uploaded images are stored inline as base64 data URLs).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const logger = new Logger('Bootstrap');

  // Body parsers with a generous limit so base64 image data URLs fit.
  // (Express defaults to 100kb, which is too small for inline images and
  // surfaces as a confusing "An unexpected error occurred".)
  const bodyLimit = process.env.BODY_LIMIT || '15mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  // Security headers
  app.use(helmet());

  // Cookie parser (required for HTTP-only refresh token cookies)
  app.use(cookieParser());

  // CORS
  // CORS — supports a single origin or a comma-separated list.
  // e.g. CORS_ORIGIN=http://localhost:3000,https://app.example.com
  const rawOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const corsOrigin = rawOrigin.includes(',')
    ? rawOrigin.split(',').map((o) => o.trim())
    : rawOrigin;
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Global prefix (health/version stay at the root for easy probing)
  app.setGlobalPrefix(process.env.API_PREFIX || 'api/v1', {
    exclude: ['health', 'version'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filters (order matters: specific first, then catch-all)
  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new PrismaExceptionFilter(),
    new PrismaInitExceptionFilter(),
  );

  // Global interceptors
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // Swagger API documentation (disabled in production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Vape Shop Management API')
      .setDescription('Complete API for vape shop inventory and sales management')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('products', 'Product management')
      .addTag('inventory', 'Inventory management')
      .addTag('sales', 'Sales management')
      .addTag('reports', 'Reporting and analytics')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
