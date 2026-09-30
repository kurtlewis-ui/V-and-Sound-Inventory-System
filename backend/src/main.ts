import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

/**
 * Standalone/local entry point. Boots the Nest app, applies the shared
 * configuration, and starts an HTTP listener.
 *
 * On Vercel the app runs as a serverless function instead (see `api/index.ts`),
 * which reuses the same `setupApp()` but never calls `listen`.
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Disable Nest's built-in body parser so setupApp() can register its own
  // with a larger limit (uploaded images are stored inline as base64 data URLs).
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  setupApp(app);

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
