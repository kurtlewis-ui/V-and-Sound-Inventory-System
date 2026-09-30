import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { PrismaInitExceptionFilter } from './common/filters/prisma-init-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

/**
 * Applies all shared Nest configuration (body parsers, security headers,
 * cookies, CORS, global prefix, pipes, filters, interceptors, Swagger) to an
 * already-created Nest application.
 *
 * This is extracted so BOTH entry points configure the app identically:
 *   - `main.ts`      — the local/standalone server (calls `app.listen`)
 *   - `api/index.ts` — the Vercel serverless function (no `listen`)
 *
 * NOTE: the caller must create the app with `{ bodyParser: false }` so our
 * larger-limit body parsers below take effect (base64 image data URLs).
 */
export function setupApp(app: INestApplication): void {
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
}
