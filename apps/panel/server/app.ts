import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Clock } from './clock.js';
import type { PanelConfig } from './config.js';
import type { PanelDatabase } from './db.js';
import { registerErrorHandling } from './errors.js';
import { registerRoutes } from './routes.js';
import type { StaffPrincipal } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    staff: StaffPrincipal | null;
  }
}

export interface PanelDeps {
  config: PanelConfig;
  db: PanelDatabase;
  clock: Clock;
}

export async function buildPanelApp(deps: PanelDeps): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1_048_576,
    logger: {
      level: deps.config.logLevel,
      redact: ['req.headers.cookie', 'res.headers["set-cookie"]', 'req.body.password'],
      ...(deps.config.nodeEnv === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : {}),
    },
  });
  app.decorateRequest('staff', null);
  registerErrorHandling(app);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(
    (instance, _options, done) => {
      registerRoutes(instance, deps);
      done();
    },
    { prefix: '/api/panel' },
  );
  app.get('/api/health', () => ({ status: 'ok' as const }));
  return app;
}
