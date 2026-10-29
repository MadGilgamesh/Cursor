import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import { SESSION_COOKIE } from '../../src/auth/session.js';
import { systemClock, type Clock } from '../../src/clock.js';
import type { AppConfig } from '../../src/config.js';
import { createDatabase } from '../../src/db/client.js';
import { createRedis } from '../../src/redis.js';
import { testConfig } from './env.js';

export interface TestContext {
  app: FastifyInstance;
  close: () => Promise<void>;
}

export async function createTestApp(
  options: { config?: Partial<AppConfig>; clock?: Clock } = {},
): Promise<TestContext> {
  const config = testConfig(options.config);
  const database = createDatabase(config.databaseUrl, { max: 5 });
  const redis = createRedis(config.redisUrl);
  const app = await buildApp({
    config,
    db: database.db,
    redis,
    clock: options.clock ?? systemClock,
  });
  await app.ready();
  return {
    app,
    close: async () => {
      await app.close();
      await database.close();
      redis.disconnect();
    },
  };
}

export function uniqueAccount() {
  const suffix = randomUUID().slice(0, 8);
  return {
    email: `latarnik-${suffix}@sol.test`,
    characterName: `Latarnik_${suffix}`,
    password: 'Matka-Latarnia-milczy',
  };
}

/** Wyciąga wartość ciasteczka sesji z odpowiedzi `inject`. */
export function sessionCookie(response: { cookies: { name: string; value: string }[] }): string {
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error('Brak ciasteczka sesji w odpowiedzi');
  return cookie.value;
}
