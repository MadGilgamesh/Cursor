import { ERROR_CODES, HOUR_MS, planCast, witherAt, type ApiError } from '@game/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ManualClock } from '../../src/clock.js';
import { characters } from '../../src/db/schema.js';
import { call, createTestApp, registerPlayer, virtualClock, type TestContext } from './harness.js';

let ctx: TestContext;
let clock: ManualClock;

beforeAll(async () => {
  clock = virtualClock();
  ctx = await createTestApp({ clock });
});

afterAll(async () => {
  await ctx.close();
});

describe('Etap 4 — cztery miasta', () => {
  it('blokuje podróż w trakcie zlecenia i walkę w Portalu w drodze', async () => {
    const busy = await registerPlayer(ctx);
    const started = await call(ctx, busy, 'POST', '/api/v1/activities', {
      body: { missionId: 'order.quay-patrol' },
    });
    expect(started.statusCode, started.body).toBe(201);
    const denied = await call(ctx, busy, 'POST', '/api/v1/travel', { body: { city: 'ilmar' } });
    expect(denied.statusCode, denied.body).toBe(409);
    expect(denied.json<ApiError>().error.code).toBe(ERROR_CODES.activityBusy);

    const walker = await registerPlayer(ctx);
    const left = await call(ctx, walker, 'POST', '/api/v1/travel', { body: { city: 'ilmar' } });
    expect(left.statusCode, left.body).toBe(200);
    const fight = await call(ctx, walker, 'POST', '/api/v1/portal/fight', {
      body: { domain: 1, stage: 1, substage: 1 },
    });
    expect(fight.statusCode, fight.body).toBe(409);
    expect(fight.json<ApiError>().error.code).toBe(ERROR_CODES.activityBusy);
  });

  it('usycha uprawę dokładnie na wirtualnym zegarze', async () => {
    const player = await registerPlayer(ctx);
    await ctx.db.update(characters).set({ level: 8 }).where(eq(characters.id, player.characterId));
    const planted = await call(ctx, player, 'POST', '/api/v1/garden/plant', {
      body: { plot: 0, cropId: 'wormwood' },
    });
    expect(planted.statusCode, planted.body).toBe(200);

    const before = await call(ctx, player, 'GET', '/api/v1/world');
    const plot = before.json<{ plots: { plantedAt: number; phase: string }[] }>().plots[0];
    expect(plot?.phase).toBe('growing');
    const dead = witherAt(plot?.plantedAt ?? 0, HOUR_MS);
    clock.advance(dead - clock.now().getTime() - 1);

    const thirsty = await call(ctx, player, 'GET', '/api/v1/world');
    expect(thirsty.json<{ plots: { phase: string }[] }>().plots[0]?.phase).toBe('thirsty');
    clock.advance(1);
    const withered = await call(ctx, player, 'GET', '/api/v1/world');
    expect(withered.json<{ plots: { phase: string }[] }>().plots[0]?.phase).toBe('withered');
  });

  it('flaguje idealny hol i puszcza niedokładny bez flagi', async () => {
    const player = await registerPlayer(ctx);
    const cast = await call(ctx, player, 'POST', '/api/v1/fishing/cast');
    expect(cast.statusCode, cast.body).toBe(200);
    const planned = cast.json<{ seed: string; biteAtMs: number }>();
    const plan = planCast(planned.seed);
    clock.advance(planned.biteAtMs);
    const ideal = await call(ctx, player, 'POST', '/api/v1/fishing/reel', {
      body: {
        reactionOffsetMs: planned.biteAtMs,
        tensions: plan.pulls.map((pull) => pull.center),
      },
    });
    expect(ideal.statusCode, ideal.body).toBe(200);
    expect(ideal.json<{ flagged: boolean; caught: boolean }>()).toMatchObject({
      flagged: true,
      caught: true,
    });

    const again = await call(ctx, player, 'POST', '/api/v1/fishing/cast');
    expect(again.statusCode, again.body).toBe(200);
    const second = again.json<{ seed: string; biteAtMs: number }>();
    const loose = planCast(second.seed);
    clock.advance(second.biteAtMs);
    const sloppy = await call(ctx, player, 'POST', '/api/v1/fishing/reel', {
      body: {
        reactionOffsetMs: second.biteAtMs + 40,
        tensions: loose.pulls.map((pull, index) => (index === 0 ? pull.center + 3 : pull.center)),
      },
    });
    expect(sloppy.statusCode, sloppy.body).toBe(200);
    expect(sloppy.json<{ flagged: boolean; caught: boolean }>().flagged).toBe(false);
    expect(sloppy.json<{ caught: boolean }>().caught).toBe(true);
  });
});
