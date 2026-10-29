import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';

const base = {
  DATABASE_URL: 'postgres://game:game@localhost:5432/game',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadConfig', () => {
  it('ustawia bezpieczne wartości domyślne', () => {
    const config = loadConfig(base);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.cookieSecure).toBe(false);
    expect(config.sessionTtlMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('na produkcji domyślnie wymaga bezpiecznych ciasteczek', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).cookieSecure).toBe(true);
    expect(
      loadConfig({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' }).cookieSecure,
    ).toBe(false);
  });

  it('zgłasza czytelny błąd przy brakujących zmiennych', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, REDIS_URL: 'http://localhost' })).toThrow(/REDIS_URL/);
  });
});
