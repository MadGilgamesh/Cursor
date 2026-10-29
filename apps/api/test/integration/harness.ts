import { randomUUID } from 'node:crypto';

import { IDEMPOTENCY_HEADER, sessionResponseSchema } from '@game/shared';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import { SESSION_COOKIE } from '../../src/auth/session.js';
import { ManualClock, systemClock, type Clock } from '../../src/clock.js';
import type { AppConfig } from '../../src/config.js';
import { createDatabase, type Database } from '../../src/db/client.js';
import { createJobsQueue, type JobsQueue } from '../../src/jobs/queue.js';
import { createRedis } from '../../src/redis.js';
import { testConfig, TEST_REDIS_URL } from './env.js';

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  jobs: JobsQueue;
  config: AppConfig;
  close: () => Promise<void>;
}

export async function createTestApp(
  options: { config?: Partial<AppConfig>; clock?: Clock } = {},
): Promise<TestContext> {
  const config = testConfig(options.config);
  const database = createDatabase(config.databaseUrl, { max: 10 });
  const redis = createRedis(config.redisUrl);
  const jobs = createJobsQueue(TEST_REDIS_URL);
  const app = await buildApp({
    config,
    db: database.db,
    redis,
    jobs,
    clock: options.clock ?? systemClock,
  });
  await app.ready();
  return {
    app,
    db: database.db,
    jobs,
    config,
    close: async () => {
      await app.close();
      await jobs.close();
      await database.close();
      redis.disconnect();
    },
  };
}

/** Zegar startujący „teraz” — sesje i znaczniki w bazie muszą być spójne z czasem serwera. */
export const virtualClock = () => new ManualClock(Date.now());

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

export interface Player {
  token: string;
  accountId: string;
  characterId: string;
}

export async function registerPlayer(ctx: TestContext): Promise<Player> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: uniqueAccount(),
  });
  if (response.statusCode !== 201) throw new Error(`Rejestracja nieudana: ${response.body}`);
  const body = sessionResponseSchema.parse(response.json());
  return {
    token: sessionCookie(response),
    accountId: body.account.id,
    characterId: body.character.id,
  };
}

/** Żądanie gracza; akcje mutujące dostają nowy klucz idempotencji, chyba że podano własny. */
export function call(
  ctx: TestContext,
  player: Player,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  options: { body?: object; idempotencyKey?: string | null } = {},
) {
  const key =
    options.idempotencyKey === undefined
      ? method === 'POST'
        ? randomUUID()
        : null
      : options.idempotencyKey;
  return ctx.app.inject({
    method,
    url,
    cookies: { [SESSION_COOKIE]: player.token },
    headers: key ? { [IDEMPOTENCY_HEADER]: key } : {},
    ...(options.body ? { payload: options.body } : {}),
  });
}
