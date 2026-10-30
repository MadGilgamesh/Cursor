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

  it('Web Push jest wyłączony bez kluczy VAPID i wymaga obu kluczy naraz', () => {
    expect(loadConfig(base).vapid).toBeNull();
    expect(
      loadConfig({ ...base, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }).vapid,
    ).toMatchObject({ publicKey: 'pub', privateKey: 'priv' });
    expect(() => loadConfig({ ...base, VAPID_PUBLIC_KEY: 'pub' })).toThrow(/VAPID/);
    expect(loadConfig({ ...base, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' }).vapid).toBeNull();
  });

  it('nie pozwala włączyć sterowania testowego na produkcji', () => {
    expect(loadConfig({ ...base, ENABLE_TEST_CONTROLS: 'true' }).enableTestControls).toBe(true);
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', ENABLE_TEST_CONTROLS: 'true' }),
    ).toThrow(/ENABLE_TEST_CONTROLS/);
  });
});
