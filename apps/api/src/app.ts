import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { API_PREFIX, validateStaticData } from '@game/shared';
import Fastify, { type FastifyInstance, type FastifyPluginCallback } from 'fastify';

import { registerAuth } from './auth/plugin.js';
import { authRoutes } from './auth/routes.js';
import { characterRoutes } from './character/routes.js';
import type { Clock } from './clock.js';
import type { AppConfig } from './config.js';
import type { Database } from './db/client.js';
import { registerErrorHandling } from './errors.js';
import { gameRoutes } from './game/routes.js';
import { loreRoutes } from './game/lore-routes.js';
import { worldRoutes } from './game/world-routes.js';
import { conjunctionRoutes } from './game/conjunction-routes.js';
import { expeditionRoutes } from './game/expedition-routes.js';
import { hearthRoutes } from './game/hearth-routes.js';
import { lodgeRoutes } from './game/lodge-routes.js';
import { portRoutes } from './game/port-routes.js';
import { portalRoutes } from './game/portal-routes.js';
import { stage1Routes } from './game/stage1-routes.js';
import { healthRoutes } from './health/routes.js';
import type { JobsQueue } from './jobs/queue.js';
import { pushRoutes } from './push/routes.js';
import type { Redis } from './redis.js';
import { testControlRoutes } from './testing/routes.js';
import { timeRoutes } from './time/routes.js';

export interface AppDeps {
  config: AppConfig;
  db: Database;
  redis: Redis;
  clock: Clock;
  /** Kolejka zadań — API tylko dokłada zadania; przetwarza je osobny proces workera. */
  jobs: JobsQueue;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  // Dane statyczne są częścią kontraktu gry — z błędnymi danymi serwer nie startuje (GDD 8.3).
  validateStaticData();
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
    nameSpace: 'zb:rate-limit:',
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
  await app.register(routes(gameRoutes), { prefix: API_PREFIX });
  await app.register(routes(stage1Routes), { prefix: API_PREFIX });
  await app.register(routes(portalRoutes), { prefix: API_PREFIX });
  await app.register(routes(loreRoutes), { prefix: API_PREFIX });
  await app.register(routes(worldRoutes), { prefix: API_PREFIX });
  await app.register(routes(portRoutes), { prefix: API_PREFIX });
  await app.register(routes(lodgeRoutes), { prefix: API_PREFIX });
  await app.register(routes(hearthRoutes), { prefix: API_PREFIX });
  await app.register(routes(expeditionRoutes), { prefix: API_PREFIX });
  await app.register(routes(conjunctionRoutes), { prefix: API_PREFIX });
  await app.register(routes(pushRoutes), { prefix: API_PREFIX });
  if (config.enableTestControls) {
    await app.register(routes(testControlRoutes), { prefix: '/api/test' });
  }

  return app;
}
