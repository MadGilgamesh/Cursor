import {
  MINUTE_MS,
  pushConfigResponseSchema,
  pushPayloadSchema,
  type ApiError,
  ERROR_CODES,
} from '@game/shared';
import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ManualClock } from '../../src/clock.js';
import { pushSubscriptions, sessions } from '../../src/db/schema.js';
import {
  createJobProcessor,
  createJobsWorker,
  registerSchedules,
  SCHEDULES,
} from '../../src/jobs/queue.js';
import { createWebPushSender } from '../../src/push/sender.js';
import { TEST_REDIS_URL } from './env.js';
import { call, createTestApp, registerPlayer, virtualClock, type TestContext } from './harness.js';
import { startPushReceiver, type PushReceiver } from './push-receiver.js';

const vapidKeys = webpush.generateVAPIDKeys();
const vapid = { ...vapidKeys, subject: 'mailto:test@sol.test' };

let ctx: TestContext;
let clock: ManualClock;
let receiver: PushReceiver;

beforeAll(async () => {
  clock = virtualClock();
  ctx = await createTestApp({ clock, config: { vapid } });
  receiver = await startPushReceiver();
});

afterAll(async () => {
  await receiver.close();
  await ctx.close();
});

describe('Web Push — konfiguracja i subskrypcje', () => {
  it('udostępnia klucz publiczny VAPID', async () => {
    const player = await registerPlayer(ctx);
    const config = pushConfigResponseSchema.parse(
      (await call(ctx, player, 'GET', '/api/v1/push/config')).json(),
    );
    expect(config).toEqual({ enabled: true, publicKey: vapid.publicKey });
  });

  it('bez kluczy VAPID push jest wyłączony', async () => {
    const disabled = await createTestApp();
    try {
      const player = await registerPlayer(disabled);
      expect((await call(disabled, player, 'GET', '/api/v1/push/config')).json()).toEqual({
        enabled: false,
        publicKey: null,
      });
      const rejected = await call(disabled, player, 'POST', '/api/v1/push/subscriptions', {
        body: receiver.subscription(),
      });
      expect(rejected.statusCode).toBe(503);
      expect(rejected.json<ApiError>().error.code).toBe(ERROR_CODES.pushUnavailable);
    } finally {
      await disabled.close();
    }
  });

  it('zapisuje i usuwa subskrypcję urządzenia', async () => {
    const player = await registerPlayer(ctx);
    const subscription = receiver.subscription();
    expect(
      (await call(ctx, player, 'POST', '/api/v1/push/subscriptions', { body: subscription }))
        .statusCode,
    ).toBe(201);
    const stored = await ctx.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.accountId, player.accountId));
    expect(stored).toHaveLength(1);

    const removed = await call(ctx, player, 'DELETE', '/api/v1/push/subscriptions', {
      body: { endpoint: subscription.endpoint },
    });
    expect(removed.statusCode).toBe(204);
    expect(
      await ctx.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.accountId, player.accountId)),
    ).toEqual([]);
  });
});

describe('scheduler i worker (GDD 9.3)', () => {
  it('rejestruje zadania cykliczne: rozstrzyganie timerów co minutę i reset o północy UTC', async () => {
    await registerSchedules(ctx.jobs);
    const schedulers = await ctx.jobs.getJobSchedulers();
    expect(schedulers.map((scheduler) => scheduler.key).sort()).toEqual(
      SCHEDULES.map((schedule) => schedule.id).sort(),
    );
    expect(schedulers.find((s) => s.key === 'activities-sweep')?.every).toBe(60_000);
    expect(schedulers.find((s) => s.key === 'maintenance-daily')?.pattern).toBe('0 0 * * *');
    for (const schedule of SCHEDULES) await ctx.jobs.removeJobScheduler(schedule.id);
  });

  it('koniec zlecenia → worker rozstrzyga timer → zaszyfrowane powiadomienie trafia na urządzenie', async () => {
    const player = await registerPlayer(ctx);
    const subscription = receiver.subscription();
    await call(ctx, player, 'POST', '/api/v1/push/subscriptions', { body: subscription });
    await call(ctx, player, 'POST', '/api/v1/activities', {
      body: { missionId: 'trial.wreck-search' },
    });
    clock.advance(5 * MINUTE_MS);

    const before = receiver.received.length;
    const worker = createJobsWorker(TEST_REDIS_URL, {
      db: ctx.db,
      clock,
      queue: ctx.jobs,
      push: createWebPushSender(vapid),
    });
    try {
      await ctx.jobs.add('activities.sweep', { type: 'activities.sweep' });
      const [push] = (await receiver.waitFor(before + 1)).slice(before);
      expect(push?.path).toBe(new URL(subscription.endpoint).pathname);
      expect(push?.headers['content-encoding']).toBe('aes128gcm');
      expect(push?.headers.authorization).toMatch(/^vapid t=.+, k=/);
      expect(pushPayloadSchema.parse(push?.payload)).toMatchObject({
        title: 'Zlecenie zakończone',
        url: '/',
      });
    } finally {
      await worker.close();
    }
  });

  it('subskrypcja odrzucona przez serwis push (410) jest usuwana', async () => {
    const player = await registerPlayer(ctx);
    const path = '/push/wygasla';
    const subscription = receiver.subscription(path);
    receiver.respondWith(path, 410);
    await call(ctx, player, 'POST', '/api/v1/push/subscriptions', { body: subscription });

    const process = createJobProcessor({
      db: ctx.db,
      clock,
      queue: ctx.jobs,
      push: createWebPushSender(vapid),
    });
    const result = await process({
      data: {
        type: 'push.notify',
        accountId: player.accountId,
        payload: { title: 't', body: 'b', url: '/', tag: 'x' },
      },
    });
    expect(result.details).toMatchObject({ sent: 0, removed: 1 });
    expect(
      await ctx.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.accountId, player.accountId)),
    ).toEqual([]);
  });

  it('zadanie dobowe usuwa wygasłe sesje', async () => {
    const player = await registerPlayer(ctx);
    const process = createJobProcessor({ db: ctx.db, clock, queue: ctx.jobs, push: null });
    clock.advance(31 * 24 * 60 * MINUTE_MS);
    const result = await process({ data: { type: 'maintenance.daily' } });
    expect(result.details.expiredSessions).toBeGreaterThanOrEqual(1);
    expect(
      await ctx.db.select().from(sessions).where(eq(sessions.accountId, player.accountId)),
    ).toEqual([]);
  });
});
