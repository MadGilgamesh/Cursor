import type { AppConfig } from '../../src/config.js';

/** Osobna baza i osobny numer bazy Redis, żeby testy nie dotykały danych deweloperskich. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://game:game@localhost:5432/game_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    databaseUrl: TEST_DATABASE_URL,
    redisUrl: TEST_REDIS_URL,
    cookieSecure: false,
    sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    authRateLimitMax: 1_000,
    trustProxyHops: 0,
    vapid: null,
    enableTestControls: false,
    ...overrides,
  };
}
