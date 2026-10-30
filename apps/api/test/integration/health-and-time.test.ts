import { healthResponseSchema, serverTimeResponseSchema } from '@game/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ManualClock } from '../../src/clock.js';
import { createTestApp, type TestContext } from './harness.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('GET /api/health', () => {
  it('raportuje działającą bazę i Redisa', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({
      status: 'ok',
      checks: { database: true, redis: true },
    });
  });
});

describe('GET /api/v1/time', () => {
  it('zwraca czas z zegara serwera, nie z systemu', async () => {
    const fixed = new Date('2026-10-31T23:59:59.000Z');
    const timed = await createTestApp({ clock: new ManualClock(fixed) });
    try {
      const response = await timed.app.inject({ method: 'GET', url: '/api/v1/time' });
      expect(serverTimeResponseSchema.parse(response.json())).toEqual({
        now: fixed.toISOString(),
        epochMs: fixed.getTime(),
      });
    } finally {
      await timed.close();
    }
  });
});

describe('sterowanie testowe', () => {
  it('jest niedostępne, gdy ENABLE_TEST_CONTROLS jest wyłączone', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/test/clock/advance',
      payload: { ms: 1000 },
    });
    expect(response.statusCode).toBe(404);
  });
});
