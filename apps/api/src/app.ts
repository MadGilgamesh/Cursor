import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { API_PREFIX } from '@game/shared';
import Fastify, { type FastifyInstance, type FastifyPluginCallback } from 'fastify';

import { registerAuth } from './auth/plugin.js';
import { authRoutes } from './auth/routes.js';
import { characterRoutes } from './character/routes.js';
import type { Clock } from './clock.js';
import type { AppConfig } from './config.js';
import type { Database } from './db/client.js';
import { registerErrorHandling } from './errors.js';
import { healthRoutes } from './health/routes.js';
import type { Redis } from './redis.js';
import { timeRoutes } from './time/routes.js';

export interface AppDeps {
  config: AppConfig;
  db: Database;
  redis: Redis;
  clock: Clock;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    trustProxy: (_address, hop) => hop < config.trustProxyHops,
    bodyLimit: 16 * 1024,
    logger: {
      level: config.logLevel,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      ...(config.nodeEnv === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : {}),
    },
  });

  registerErrorHandling(app);
  registerAuth(app);

  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    redis: deps.redis,
    nameSpace: 'mg:rate-limit:',
  });

  // Każdy moduł tras to osobny kontekst Fastify, więc jego hooki (np. requireAuth) nie wyciekają.
  const routes =
    (define: (instance: FastifyInstance, deps: AppDeps) => void): FastifyPluginCallback =>
    (instance, _options, done) => {
      define(instance, deps);
      done();
    };

  await app.register(routes(healthRoutes), { prefix: '/api' });
  await app.register(routes(timeRoutes), { prefix: API_PREFIX });
  await app.register(routes(authRoutes), { prefix: `${API_PREFIX}/auth` });
  await app.register(routes(characterRoutes), { prefix: API_PREFIX });

  return app;
}
