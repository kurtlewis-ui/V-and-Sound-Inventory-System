import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

/**
 * Vercel serverless entry point for the NestJS backend.
 *
 * Vercel invokes the default export as a Node.js function on every request.
 * We bootstrap Nest ONCE and cache the underlying Express request handler on
 * the module scope, so warm invocations skip the (expensive) bootstrap and
 * just forward the request straight to Express.
 *
 * There is deliberately NO `app.listen()` — Vercel owns the HTTP server; we
 * only hand it a request handler (the Express instance Nest builds on top of
 * `@nestjs/platform-express`).
 */

// The Express `RequestListener` returned by Nest's HTTP adapter.
type ExpressHandler = (req: Request, res: Response) => void;

let cachedHandler: ExpressHandler | null = null;

async function createHandler(): Promise<ExpressHandler> {
  // Disable Nest's built-in body parser so setupApp() can register its own
  // with a larger limit (base64 image data URLs).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  setupApp(app);

  // Finalise the app (wires routes) WITHOUT starting an HTTP listener.
  await app.init();

  // The underlying Express instance is itself a (req, res) request handler.
  return app.getHttpAdapter().getInstance() as unknown as ExpressHandler;
}

export default async function handler(req: Request, res: Response) {
  if (!cachedHandler) {
    cachedHandler = await createHandler();
  }
  return cachedHandler(req, res);
}
