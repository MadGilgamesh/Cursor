import {
  dashboardResponseSchema,
  ERROR_CODES,
  MINUTE_MS,
  utcDay,
  type ApiError,
} from '@game/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ManualClock } from '../../src/clock.js';
import { hearthStates, resourceStates } from '../../src/db/schema.js';
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

const dashboard = async (player: Awaited<ReturnType<typeof registerPlayer>>) => {
  const response = await call(ctx, player, 'GET', '/api/v1/dashboard');
  expect(response.statusCode).toBe(200);
  return dashboardResponseSchema.parse(response.json());
};

describe('Etap 0 — test akceptacyjny (GDD 11)', () => {
  it('rejestracja → postać → Wigor rośnie zgodnie z czasem serwera (wirtualny zegar)', async () => {
    const player = await registerPlayer(ctx);

    const start = await dashboard(player);
    expect(start.serverTime).toBe(clock.now().toISOString());
    expect(start.resources).toMatchObject({
      life: { value: 100, max: 100 },
      vigor: { value: 100, max: 100 },
      toil: { value: 50, max: 50 },
      sanity: { value: 100, max: 100 },
    });

    // Zlecenie godzinne kosztuje 20 Wigoru (GDD 10.1).
    const started = await call(ctx, player, 'POST', '/api/v1/activities', {
      body: { missionId: 'order.canal-hunt' },
    });
    expect(started.statusCode).toBe(201);
    expect((await dashboard(player)).resources.vigor.value).toBe(80);

    clock.advance(9 * MINUTE_MS);
    expect((await dashboard(player)).resources.vigor.value).toBe(80);

    clock.advance(1 * MINUTE_MS);
    expect((await dashboard(player)).resources.vigor.value).toBe(85);

    clock.advance(25 * MINUTE_MS);
    expect((await dashboard(player)).resources.vigor.value).toBe(95);

    clock.advance(10 * MINUTE_MS);
    const full = await dashboard(player);
    expect(full.resources.vigor.value).toBe(100);

    // Pełny Wigor nie rośnie dalej, mimo upływu czasu.
    clock.advance(2 * 60 * MINUTE_MS);
    expect((await dashboard(player)).resources.vigor.value).toBe(100);
  });

  it('nie pozwala wydać Wigoru, którego nie ma', async () => {
    const player = await registerPlayer(ctx);
    await ctx.db
      .update(resourceStates)
      .set({ vigor: 4, vigorUpdatedAt: clock.now() })
      .where(eq(resourceStates.characterId, player.characterId));

    const rejected = await call(ctx, player, 'POST', '/api/v1/activities', {
      body: { missionId: 'order.quay-patrol' },
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json<ApiError>().error.code).toBe(ERROR_CODES.insufficientResources);

    // Po 10 minutach tik regeneracji wystarcza na zlecenie za 5 Wigoru.
    clock.advance(10 * MINUTE_MS);
    const accepted = await call(ctx, player, 'POST', '/api/v1/activities', {
      body: { missionId: 'order.quay-patrol' },
    });
    expect(accepted.statusCode).toBe(201);
    expect((await dashboard(player)).resources.vigor.value).toBe(4);
  });

  it('Sypialnia i Kaplica Domowa skracają tik, a zaległość gasi premię', async () => {
    const player = await registerPlayer(ctx);
    const anchor = clock.now();
    await ctx.db
      .update(resourceStates)
      .set({ vigor: 0, vigorUpdatedAt: anchor, sanity: 0, sanityUpdatedAt: anchor })
      .where(eq(resourceStates.characterId, player.characterId));
    await ctx.db
      .insert(hearthStates)
      .values({
        characterId: player.characterId,
        houseId: 'room',
        arrears: false,
        paidThrough: utcDay(anchor.getTime()),
        rooms: { bedroom: 1, chapel: 1 },
      })
      .onConflictDoUpdate({
        target: hearthStates.characterId,
        set: {
          houseId: 'room',
          arrears: false,
          buildEndsAt: null,
          paidThrough: utcDay(anchor.getTime()),
          rooms: { bedroom: 1, chapel: 1 },
        },
      });

    const vigorInterval = Math.round((10 * MINUTE_MS * 10_000) / 10_500);
    clock.advance(vigorInterval - 1);
    expect((await dashboard(player)).resources.vigor.value).toBe(0);
    clock.advance(1);
    const ticked = await dashboard(player);
    expect(ticked.resources.vigor.value).toBe(5);
    expect(ticked.resources.sanity.value).toBe(0);
    expect(ticked.regen).toEqual({ patron: false, vigorRegenBp: 500, sanityRegenBp: 2_000 });

    const hearth = await call(ctx, player, 'GET', '/api/v1/hearth');
    expect(hearth.statusCode).toBe(200);
    expect(hearth.json()).toMatchObject({ vigorBonusBp: 500, sanityBonusBp: 2_000 });

    const sanityInterval = 50 * MINUTE_MS;
    clock.advance(sanityInterval - vigorInterval);
    expect((await dashboard(player)).resources.sanity.value).toBe(3);

    const restarted = clock.now();
    await ctx.db
      .update(hearthStates)
      .set({ arrears: true })
      .where(eq(hearthStates.characterId, player.characterId));
    await ctx.db
      .update(resourceStates)
      .set({ vigor: 0, vigorUpdatedAt: restarted })
      .where(eq(resourceStates.characterId, player.characterId));
    clock.advance(vigorInterval);
    const slowed = await dashboard(player);
    expect(slowed.resources.vigor.value).toBe(0);
    expect(slowed.regen).toEqual({ patron: false, vigorRegenBp: 0, sanityRegenBp: 0 });
  });
});
