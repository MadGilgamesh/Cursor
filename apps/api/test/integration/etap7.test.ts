import { randomUUID } from 'node:crypto';

import { DAY_MS, HOUR_MS, MINUTE_MS, generateCase, leaksCaseSecret } from '@game/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ManualClock } from '../../src/clock.js';
import {
  characters,
  hearthStates,
  loreStates,
  portalStates,
  worldStates,
} from '../../src/db/schema.js';
import { postLedgerEntry } from '../../src/game/wallet.js';
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

async function silver(characterId: string, delta: number) {
  await postLedgerEntry(ctx.db, {
    characterId,
    currency: 'silver',
    delta,
    reason: 'test',
    idempotencyKey: randomUUID(),
  });
}

function advanceToMonday() {
  for (let step = 0; step < 8 && clock.now().getUTCDay() !== 1; step += 1) {
    clock.advance(DAY_MS);
  }
}

describe('Etap 7 — dom, krąg i Domena 7', () => {
  it('prowadzi Sprawę do tomu, rytuału i kryjówki', async () => {
    const player = await registerPlayer(ctx);
    const early = await call(ctx, player, 'POST', '/api/v1/tomes/start', {
      body: { tomeId: 'tome.salt-psalter' },
    });
    expect(early.statusCode).toBe(409);

    await silver(player.characterId, 7_000);
    expect(
      (await call(ctx, player, 'POST', '/api/v1/hearth/house', { body: { houseId: 'room' } }))
        .statusCode,
    ).toBe(200);
    clock.advance(HOUR_MS);
    expect(
      (await call(ctx, player, 'POST', '/api/v1/hearth/rooms', { body: { room: 'cellar' } }))
        .statusCode,
    ).toBe(200);

    const opened = await call(ctx, player, 'POST', '/api/v1/investigations/open');
    expect(opened.statusCode).toBe(200);
    expect(leaksCaseSecret(opened.json())).toBe(false);
    const [lore] = await ctx.db
      .select()
      .from(loreStates)
      .where(eq(loreStates.characterId, player.characterId));
    if (!lore?.caseSeed) throw new Error('Sprawa nie ma ziarna');
    const solution = generateCase(lore.caseSeed).solution;
    const deduced = await call(ctx, player, 'POST', '/api/v1/investigations/deduce', {
      body: solution,
    });
    expect(deduced.statusCode).toBe(200);
    expect(deduced.json()).toMatchObject({ score: 3, status: 'solved' });
    expect(leaksCaseSecret(deduced.json())).toBe(false);
    const [shelf] = await ctx.db
      .select()
      .from(hearthStates)
      .where(eq(hearthStates.characterId, player.characterId));
    expect(shelf?.shelf).toContain('tome.salt-psalter');
    expect(shelf?.candles).toBeGreaterThanOrEqual(12);

    expect(
      (
        await call(ctx, player, 'POST', '/api/v1/tomes/start', {
          body: { tomeId: 'tome.salt-psalter' },
        })
      ).statusCode,
    ).toBe(200);
    clock.advance(2 * HOUR_MS);
    expect((await call(ctx, player, 'POST', '/api/v1/tomes/claim')).statusCode).toBe(200);

    let hideout = false;
    for (let attempt = 0; attempt < 12 && !hideout; attempt += 1) {
      const started = await call(ctx, player, 'POST', '/api/v1/hearth/rituals', {
        body: { ritualId: 'opening.hideout' },
      });
      expect(started.statusCode).toBe(200);
      clock.advance(10 * MINUTE_MS);
      const resolved = await call(ctx, player, 'POST', '/api/v1/hearth/rituals/resolve');
      expect(resolved.statusCode).toBe(200);
      hideout = resolved.json<{ hideout: boolean }>().hideout;
    }
    expect(hideout).toBe(true);
    const loot = await call(ctx, player, 'POST', '/api/v1/hearth/hideout');
    expect(loot.statusCode).toBe(200);
    expect(loot.json()).toMatchObject({ silver: 250 });
  });

  it('Sól Gwiezdna daje wybór jednej z trzech mutacji', async () => {
    const player = await registerPlayer(ctx);
    let offer: string[] = [];
    for (let drink = 0; drink < 3; drink += 1) {
      const salt = await call(ctx, player, 'POST', '/api/v1/hearth/salt');
      expect(salt.statusCode).toBe(200);
      offer = salt.json<{ offer: string[] }>().offer;
    }
    expect(offer).toHaveLength(3);
    const bad = await call(ctx, player, 'POST', '/api/v1/hearth/mutation', {
      body: { id: 'not-a-mutation' },
    });
    expect(bad.statusCode).toBe(409);
    const picked = offer[0];
    if (!picked) throw new Error('pusta oferta');
    const chosen = await call(ctx, player, 'POST', '/api/v1/hearth/mutation', {
      body: { id: picked },
    });
    expect(chosen.statusCode).toBe(200);
    expect(chosen.json<{ mutations: string[] }>().mutations).toEqual([picked]);
  });

  it('Ołtarz wymienia 10 Odprysków na 1 albo 2 Sigile', async () => {
    const player = await registerPlayer(ctx);
    await ctx.db
      .update(portalStates)
      .set({ sigilShards: 10 })
      .where(eq(portalStates.characterId, player.characterId));
    const exchange = await call(ctx, player, 'POST', '/api/v1/portal/exchange', {
      body: { domain: 1 },
    });
    expect(exchange.statusCode).toBe(200);
    const body = exchange.json<{ sigils: number; shards: number; doubled: boolean }>();
    expect(body.shards).toBe(0);
    expect([1, 2]).toContain(body.sigils);
    expect(body.doubled).toBe(body.sigils === 2);
  });

  it('walka w Domenie 7 dokłada dziesiątą Skażenia nawet przy porażce', async () => {
    const player = await registerPlayer(ctx);
    await ctx.db
      .update(portalStates)
      .set({ clearedDomain: 6, clearedStage: 10, clearedSubstage: 8, lootKeys: 1 })
      .where(eq(portalStates.characterId, player.characterId));
    const fight = await call(ctx, player, 'POST', '/api/v1/portal/fight', {
      body: { domain: 7, stage: 1, substage: 1 },
    });
    expect(fight.statusCode).toBe(200);
    const [world] = await ctx.db
      .select()
      .from(worldStates)
      .where(eq(worldStates.characterId, player.characterId));
    expect(world?.contaminationTenths).toBe(1);
  });

  it('zaległe utrzymanie gasi pokoje', async () => {
    const player = await registerPlayer(ctx);
    await silver(player.characterId, 5_000);
    expect(
      (await call(ctx, player, 'POST', '/api/v1/hearth/house', { body: { houseId: 'room' } }))
        .statusCode,
    ).toBe(200);
    clock.advance(HOUR_MS + 10 * DAY_MS);
    const home = await call(ctx, player, 'GET', '/api/v1/hearth');
    expect(home.statusCode).toBe(200);
    expect(home.json<{ house: { arrears: boolean } }>().house.arrears).toBe(true);
    const room = await call(ctx, player, 'POST', '/api/v1/hearth/rooms', {
      body: { room: 'cellar' },
    });
    expect(room.statusCode).toBe(409);
    expect(room.json<{ error: { message: string } }>().error.message).toContain('Zaległość');
  });

  it('Przysięga rośnie w poniedziałki, a zdemaskowany kult traci zlecenia Zakonu', async () => {
    const player = await registerPlayer(ctx);
    advanceToMonday();
    expect(
      (await call(ctx, player, 'POST', '/api/v1/hearth/oath', { body: { sleeper: 'ulthaeg' } }))
        .statusCode,
    ).toBe(200);
    clock.advance(DAY_MS);
    const first = await call(ctx, player, 'GET', '/api/v1/hearth');
    expect(first.json<{ oath: { circle: number } }>().oath.circle).toBe(1);

    advanceToMonday();
    expect(
      (await call(ctx, player, 'POST', '/api/v1/hearth/oath', { body: { sleeper: 'ulthaeg' } }))
        .statusCode,
    ).toBe(200);
    clock.advance(DAY_MS);
    const second = await call(ctx, player, 'GET', '/api/v1/hearth');
    expect(second.json<{ oath: { circle: number; wrath: boolean } }>().oath).toMatchObject({
      circle: 2,
      wrath: false,
    });

    await ctx.db.update(characters).set({ level: 20 }).where(eq(characters.id, player.characterId));
    expect((await call(ctx, player, 'POST', '/api/v1/hearth/cult')).statusCode).toBe(200);
    let suspicion = 0;
    for (let order = 0; order < 7; order += 1) {
      const done = await call(ctx, player, 'POST', '/api/v1/hearth/cult/order');
      expect(done.statusCode).toBe(200);
      suspicion = done.json<{ suspicion: number }>().suspicion;
    }
    expect(suspicion).toBe(100);
    const errand = await call(ctx, player, 'POST', '/api/v1/factions/errand', {
      body: { faction: 'order' },
    });
    expect(errand.statusCode).toBe(409);
    expect(errand.json<{ error: { message: string } }>().error.message).toContain('zdemaskowanym');

    advanceToMonday();
    expect(
      (await call(ctx, player, 'POST', '/api/v1/hearth/oath', { body: { sleeper: 'zharnuul' } }))
        .statusCode,
    ).toBe(200);
    clock.advance(DAY_MS);
    const wrath = await call(ctx, player, 'GET', '/api/v1/hearth');
    expect(wrath.json<{ oath: { circle: number; wrath: boolean } }>().oath).toMatchObject({
      circle: 1,
      wrath: true,
    });
  });
});
