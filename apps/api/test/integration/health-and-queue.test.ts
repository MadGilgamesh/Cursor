import { healthResponseSchema, serverTimeResponseSchema } from '@game/shared';
import { QueueEvents } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ManualClock } from '../../src/clock.js';
import { createTimersQueue, createTimersWorker, TIMERS_QUEUE } from '../../src/queues/timers.js';
import { TEST_REDIS_URL } from './env.js';
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

describe('kolejka timerów', () => {
  it('worker przetwarza zadanie z kolejki', async () => {
    const queue = createTimersQueue(TEST_REDIS_URL);
    const worker = createTimersWorker(TEST_REDIS_URL);
    const events = new QueueEvents(TIMERS_QUEUE, {
      connection: { url: TEST_REDIS_URL },
      prefix: 'mg:bull',
    });
    try {
      await events.waitUntilReady();
      const job = await queue.add('heartbeat', {
        type: 'system.heartbeat',
        requestedAt: new Date().toISOString(),
      });
      const result = await job.waitUntilFinished(events, 10_000);
      expect(result.type).toBe('system.heartbeat');
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
    }
  });
});
