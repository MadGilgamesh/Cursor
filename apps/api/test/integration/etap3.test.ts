import { leaksCaseSecret } from '@game/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { characterStats, loreStates, portalStates } from '../../src/db/schema.js';
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

async function boost(characterId: string) {
  await ctx.db
    .update(characterStats)
    .set({ strength: 500_000, defense: 500_000, accuracy: 500_000, evasion: 500_000 })
    .where(eq(characterStats.characterId, characterId));
}

describe('Etap 3 — Wiedza Zakazana i Sigile', () => {
  it('nie oddaje rozwiązania Sprawy w żadnej odpowiedzi', async () => {
    const player = await registerPlayer(ctx);
    const opened = await call(ctx, player, 'POST', '/api/v1/investigations/open', { body: {} });
    expect(opened.statusCode, opened.body).toBe(200);
    expect(leaksCaseSecret(opened.json())).toBe(false);
    expect(opened.body).not.toContain('pointsAt');
    expect(opened.body).not.toContain('"solution"');
    expect(opened.body).not.toContain('"seed"');

    const view = await call(ctx, player, 'GET', '/api/v1/lore');
    expect(view.statusCode, view.body).toBe(200);
    expect(leaksCaseSecret(view.json())).toBe(false);
    const clue = view
      .json<{
        case: { clues: { id: string; source: string; question: string; found: boolean }[] };
      }>()
      .case.clues.find((entry) => entry.source === 'search' && entry.question === 'who');
    expect(clue?.found).toBe(false);

    const taken = await call(ctx, player, 'POST', '/api/v1/investigations/clue', {
      body: { clueId: clue?.id },
    });
    expect(taken.statusCode, taken.body).toBe(200);
    expect(leaksCaseSecret(taken.json())).toBe(false);
    expect(taken.body).not.toContain('pointsAt');
    const revealed = taken
      .json<{
        case: { clues: { id: string; supports?: number }[] };
      }>()
      .case.clues.find((entry) => entry.id === clue?.id);
    expect(revealed?.supports).toEqual(expect.any(Number));

    const deduced = await call(ctx, player, 'POST', '/api/v1/investigations/deduce', {
      body: { who: 0, where: 0, intent: 0 },
    });
    expect(deduced.statusCode, deduced.body).toBe(200);
    expect(leaksCaseSecret(deduced.json())).toBe(false);
    expect(deduced.body).not.toContain('pointsAt');
    expect(deduced.body).not.toContain('"solution"');
  });

  it('odrzuca etap 6 Domeny 3 bez Sigilu i nie zwraca klucza', async () => {
    const player = await registerPlayer(ctx);
    await ctx.db
      .update(portalStates)
      .set({
        clearedDomain: 3,
        clearedStage: 4,
        clearedSubstage: 8,
        lootKeys: 0,
        regenKeys: 0,
        sigils: {},
      })
      .where(eq(portalStates.characterId, player.characterId));
    const early = await call(ctx, player, 'POST', '/api/v1/portal/fight', {
      body: { domain: 3, stage: 5, substage: 1 },
    });
    expect(early.statusCode, early.body).toBe(409);
    expect(early.json()).toMatchObject({ error: { code: 'NO_DREAM_KEY' } });

    await ctx.db
      .update(portalStates)
      .set({ clearedStage: 5, lootKeys: 1, sigils: {} })
      .where(eq(portalStates.characterId, player.characterId));
    const denied = await call(ctx, player, 'POST', '/api/v1/portal/fight', {
      body: { domain: 3, stage: 6, substage: 1 },
    });
    expect(denied.statusCode, denied.body).toBe(409);
    expect(denied.json()).toMatchObject({ error: { code: 'NO_SIGIL' } });

    await ctx.db
      .update(portalStates)
      .set({ sigils: { '3': 1 }, lootKeys: 1 })
      .where(eq(portalStates.characterId, player.characterId));
    const fought = await call(ctx, player, 'POST', '/api/v1/portal/fight', {
      body: { domain: 3, stage: 6, substage: 1 },
    });
    expect(fought.statusCode, fought.body).toBe(200);
    expect(fought.json<{ shardsGained: number }>().shardsGained).toBe(0);
    const row = await ctx.db
      .select()
      .from(portalStates)
      .where(eq(portalStates.characterId, player.characterId));
    expect(row[0]?.sigils['3']).toBe(0);
    expect(row[0]?.lootKeys).toBe(1);
  });

  it('Przekucie kończy się na piątym, a Wiedza 20 nie bierze Ichoru', async () => {
    const player = await registerPlayer(ctx);
    await ctx.db
      .update(portalStates)
      .set({ lootKeys: 15, ichor: 5, sigils: {} })
      .where(eq(portalStates.characterId, player.characterId));
    const key = 'przekucie-etap3-raz';
    const first = await call(ctx, player, 'POST', '/api/v1/portal/reforge', {
      body: { domain: 1 },
      idempotencyKey: key,
    });
    expect(first.statusCode, first.body).toBe(200);
    const replay = await call(ctx, player, 'POST', '/api/v1/portal/reforge', {
      body: { domain: 1 },
      idempotencyKey: key,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    for (let index = 0; index < 4; index += 1) {
      const next = await call(ctx, player, 'POST', '/api/v1/portal/reforge', {
        body: { domain: 1 },
      });
      expect(next.statusCode, next.body).toBe(200);
    }
    const sixth = await call(ctx, player, 'POST', '/api/v1/portal/reforge', {
      body: { domain: 1 },
    });
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json()).toMatchObject({ error: { code: 'REQUIREMENT_NOT_MET' } });
    const row = await ctx.db
      .select()
      .from(portalStates)
      .where(eq(portalStates.characterId, player.characterId));
    expect(row[0]?.sigils['1']).toBe(5);
    expect(row[0]?.reforgeCount).toBe(5);
    expect(row[0]?.ichor).toBe(0);

    const scholar = await registerPlayer(ctx);
    await ctx.db
      .update(loreStates)
      .set({ knowledge: 20 })
      .where(eq(loreStates.characterId, scholar.characterId));
    await ctx.db
      .update(portalStates)
      .set({ lootKeys: 3, ichor: 0 })
      .where(eq(portalStates.characterId, scholar.characterId));
    const free = await call(ctx, scholar, 'POST', '/api/v1/portal/reforge', {
      body: { domain: 1 },
    });
    expect(free.statusCode, free.body).toBe(200);
    const after = await ctx.db
      .select()
      .from(portalStates)
      .where(eq(portalStates.characterId, scholar.characterId));
    expect(after[0]?.ichor).toBe(0);
    expect(after[0]?.sigils['1']).toBe(1);
  });

  it('Wiedza 80 obniża maksimum Poczytalności do 40', async () => {
    const player = await registerPlayer(ctx);
    await ctx.db
      .update(loreStates)
      .set({ knowledge: 80 })
      .where(eq(loreStates.characterId, player.characterId));
    const home = await call(ctx, player, 'GET', '/api/v1/dashboard');
    expect(home.statusCode, home.body).toBe(200);
    expect(home.json<{ resources: { sanity: { max: number } } }>().resources.sanity.max).toBe(40);
    expect(home.json<{ lore: { knowledge: number } }>().lore.knowledge).toBe(80);
  });

  it('tysiącne zabicie typu z Domeny daje Sigil tego boga', async () => {
    const player = await registerPlayer(ctx);
    await boost(player.characterId);
    await ctx.db
      .update(portalStates)
      .set({ lootKeys: 1, sigils: {} })
      .where(eq(portalStates.characterId, player.characterId));
    await ctx.db
      .update(loreStates)
      .set({ bestiary: { '1:1': 999 }, bestiarySigils: [] })
      .where(eq(loreStates.characterId, player.characterId));
    const fight = await call(ctx, player, 'POST', '/api/v1/portal/fight', {
      body: { domain: 1, stage: 1, substage: 1 },
    });
    expect(fight.statusCode, fight.body).toBe(200);
    expect(fight.json<{ result: { winner: string } }>().result.winner).toBe('player');
    const row = await ctx.db
      .select()
      .from(portalStates)
      .where(eq(portalStates.characterId, player.characterId));
    expect(row[0]?.sigils['1']).toBe(1);
    const lore = await ctx.db
      .select()
      .from(loreStates)
      .where(eq(loreStates.characterId, player.characterId));
    expect(lore[0]?.bestiary['1:1']).toBe(1000);
  });
});
