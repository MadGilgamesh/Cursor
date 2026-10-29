import type { HealthResponse } from '@game/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app.js';

const CHECK_TIMEOUT_MS = 2_000;

async function probe(check: () => Promise<unknown>): Promise<boolean> {
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('timeout'));
        }, CHECK_TIMEOUT_MS).unref();
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function healthRoutes(app: FastifyInstance, { db, redis }: AppDeps): void {
  app.get('/health', async (_request, reply) => {
    const [database, redisOk] = await Promise.all([
      probe(() => db.execute(sql`select 1`)),
      probe(() => redis.ping()),
    ]);
    const healthy = database && redisOk;
    const body: HealthResponse = {
      status: healthy ? 'ok' : 'degraded',
      checks: { database, redis: redisOk },
    };
    return reply.status(healthy ? 200 : 503).send(body);
  });
}
