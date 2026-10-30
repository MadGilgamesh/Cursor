import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { characterStats, portalStates, resourceStates } from '../../src/db/schema.js';
import { call, createTestApp, registerPlayer, virtualClock, type TestContext } from './harness.js';
import type { ManualClock } from '../../src/clock.js';

let ctx: TestContext;
let clock: ManualClock;

beforeAll(async () => {
  clock = virtualClock();
  ctx = await createTestApp({ clock });
});

afterAll(async () => {
  await ctx.close();
});

const HOUR = 60 * 60_000;

async function boost(characterId: string) {
  await ctx.db
    .update(characterStats)
    .set({ strength: 500_000, defense: 500_000, accuracy: 500_000, evasion: 500_000 })
    .where(eq(characterStats.characterId, characterId));
}

describe('Etap 2 — Portal Bogów', () => {
  it('regeneruje Pęk do 6 kluczy i nie ponad', async () => {
    const player = await registerPlayer(ctx);
    clock.advance(4 * HOUR);
    const one = await call(ctx, player, 'GET', '/api/v1/portal');
    expect(one.json<{ keys: { regen: number } }>().keys.regen).toBe(1);
    clock.advance(24 * HOUR);
    const full = await call(ctx, player, 'GET', '/api/v1/portal');
    expect(full.json<{ keys: { regen: number; loot: number } }>().keys.regen).toBe(6);
    clock.advance(8 * HOUR);
    const still = await call(ctx, player, 'GET', '/api/v1/portal');
    expect(still.json<{ keys: { regen: number } }>().keys.regen).toBe(6);
  });

  it('odrzuca pominięcie podetapu i nie wysyła do Przytułku', async () => {
    const player = await registerPlayer(ctx);
    clock.advance(4 * HOUR);
    await ctx.db
      .update(resourceStates)
      .set({ life: 1, lifeUpdatedAt: clock.now() })
      .where(eq(resourceStates.characterId, player.characterId));
    const skip = await call(ctx, player, 'POST', '/api/v1/portal/fight', {
      body: { domain: 1, stage: 1, substage: 2 },
    });
    expect(skip.statusCode).toBe(409);

    const fight = await call(ctx, player, 'POST', '/api/v1/portal/fight', {
      body: { domain: 1, stage: 1, substage: 1 },
    });
    expect(fight.statusCode, fight.body).toBe(200);
    const body = fight.json<{
      result: { winner: string };
      shardsGained: number;
      life: number;
      status: string;
    }>();
    expect(body.shardsGained).toBe(1);
    expect(body.life).toBe(1);
    expect(body.status).toBe('ok');
    const stats = await ctx.db
      .select({ status: characterStats.status })
      .from(characterStats)
      .where(eq(characterStats.characterId, player.characterId));
    expect(stats[0]?.status).toBe('ok');
  });

  it('pierwsze przejście jest raz, a powtórka płaci stawkę podstawową', async () => {
    const player = await registerPlayer(ctx);
    await boost(player.characterId);
    clock.advance(8 * HOUR);
    const first = await call(ctx, player, 'POST', '/api/v1/portal/fight', {
      body: { domain: 1, stage: 1, substage: 1 },
    });
    expect(first.statusCode, first.body).toBe(200);
    const firstBody = first.json<{ firstClear: boolean; experience: number }>();
    expect(firstBody.firstClear).toBe(true);
    const again = await call(ctx, player, 'POST', '/api/v1/portal/fight', {
      body: { domain: 1, stage: 1, substage: 1 },
    });
    expect(again.statusCode, again.body).toBe(200);
    const againBody = again.json<{ firstClear: boolean; experience: number }>();
    expect(againBody.firstClear).toBe(false);
    expect(firstBody.experience).toBe(againBody.experience * 3);
    const row = await ctx.db
      .select()
      .from(portalStates)
      .where(eq(portalStates.characterId, player.characterId));
    expect(row[0]).toMatchObject({ clearedDomain: 1, clearedStage: 1, clearedSubstage: 1 });
  });

  it('sto równoległych żądań z tym samym kluczem zużywa jeden klucz', async () => {
    const player = await registerPlayer(ctx);
    await boost(player.characterId);
    clock.advance(4 * HOUR);
    const key = 'portal-raz-0001';
    const responses = await Promise.all(
      Array.from({ length: 100 }, () =>
        call(ctx, player, 'POST', '/api/v1/portal/fight', {
          body: { domain: 1, stage: 1, substage: 1 },
          idempotencyKey: key,
        }),
      ),
    );
    const ok = responses.filter((response) => response.statusCode === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const replay = await call(ctx, player, 'POST', '/api/v1/portal/fight', {
      body: { domain: 1, stage: 1, substage: 1 },
      idempotencyKey: key,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    const row = await ctx.db
      .select()
      .from(portalStates)
      .where(eq(portalStates.characterId, player.characterId));
    expect(row[0]?.regenKeys).toBe(0);
    expect(row[0]?.clearedSubstage).toBe(1);
    const bodies = ok.map((response) => response.json<{ experience: number }>().experience);
    expect(new Set(bodies).size).toBe(1);
  });
});
