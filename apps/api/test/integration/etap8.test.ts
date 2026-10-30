import { randomUUID } from 'node:crypto';

import { HOUR_MS, basePool, expeditionWeek, lootAfterObstacles } from '@game/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  characters,
  expeditionEntries,
  expeditionMembers,
  loreStates,
  portalStates,
  worldStates,
} from '../../src/db/schema.js';
import { postLedgerEntry } from '../../src/game/wallet.js';
import {
  call,
  createTestApp,
  registerPlayer,
  virtualClock,
  type Player,
  type TestContext,
} from './harness.js';

let ctx: TestContext;
let clock: ReturnType<typeof virtualClock>;

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

async function level(characterId: string, value: number) {
  await ctx.db.update(characters).set({ level: value }).where(eq(characters.id, characterId));
}

async function armButcher(player: Player) {
  const tutorial = await call(ctx, player, 'POST', '/api/v1/tutorial');
  expect(tutorial.statusCode, tutorial.body).toBe(200);
  for (const slot of ['head', 'torso', 'legs', 'hands']) {
    const bought = await call(ctx, player, 'POST', '/api/v1/shop/buy', {
      body: { itemId: `gear.butcher.${slot}.1` },
    });
    expect(bought.statusCode, bought.body).toBe(200);
  }
  const items = await call(ctx, player, 'GET', '/api/v1/inventory');
  for (const item of items.json<{
    items: { id: string; defId: string; equippedSlot: string | null }[];
  }>().items) {
    if (!item.defId.startsWith('gear.butcher.') || item.equippedSlot) continue;
    const equipped = await call(ctx, player, 'POST', '/api/v1/inventory/equip', {
      body: { itemId: item.id },
    });
    expect(equipped.statusCode, equipped.body).toBe(200);
  }
  const profile = await call(ctx, player, 'GET', '/api/v1/profile');
  expect(profile.json<{ classId: string | null }>().classId).toBe('butcher');
}

describe('Etap 8 — wyprawy, eskorty, studnia', () => {
  it('brakująca klasa obcina łup według tabeli, a snapshot klasy przeżywa zmianę sprzętu', async () => {
    const leader = await registerPlayer(ctx);
    const second = await registerPlayer(ctx);
    const third = await registerPlayer(ctx);
    for (const player of [leader, second, third]) {
      await level(player.characterId, 12);
      await silver(player.characterId, 20_000);
    }
    await armButcher(leader);

    const created = await call(ctx, leader, 'POST', '/api/v1/expeditions', {
      body: { expeditionId: 'canals' },
    });
    expect(created.statusCode, created.body).toBe(200);
    const runId = created.json<{ id: string }>().id;

    for (const player of [second, third]) {
      const joined = await call(ctx, player, 'POST', `/api/v1/expeditions/${runId}/join`, {
        body: {},
      });
      expect(joined.statusCode, joined.body).toBe(200);
    }
    for (const player of [leader, second, third]) {
      const ready = await call(ctx, player, 'POST', `/api/v1/expeditions/${runId}/ready`);
      expect(ready.statusCode, ready.body).toBe(200);
    }
    const started = await call(ctx, leader, 'POST', `/api/v1/expeditions/${runId}/start`);
    expect(started.statusCode, started.body).toBe(200);

    const bought = await call(ctx, leader, 'POST', '/api/v1/shop/buy', {
      body: { itemId: 'gear.occultist.weapon.1' },
    });
    expect(bought.statusCode, bought.body).toBe(200);
    const items = await call(ctx, leader, 'GET', '/api/v1/inventory');
    const occult = items
      .json<{ items: { id: string; defId: string }[] }>()
      .items.find((item) => item.defId === 'gear.occultist.weapon.1');
    expect(occult).toBeTruthy();
    const swapped = await call(ctx, leader, 'POST', '/api/v1/inventory/equip', {
      body: { itemId: occult!.id },
    });
    expect(swapped.statusCode, swapped.body).toBe(200);
    const after = await call(ctx, leader, 'GET', '/api/v1/profile');
    expect(after.json<{ classId: string | null }>().classId).not.toBe('butcher');

    const [snap] = await ctx.db
      .select()
      .from(expeditionMembers)
      .where(eq(expeditionMembers.characterId, leader.characterId));
    expect(snap?.classId).toBe('butcher');

    clock.advance(HOUR_MS);
    const resolved = await call(ctx, leader, 'POST', `/api/v1/expeditions/${runId}/resolve`);
    expect(resolved.statusCode, resolved.body).toBe(200);
    const body = resolved.json<{
      loot: number;
      missed: number;
      members: { classId: string | null }[];
    }>();
    const expected = lootAfterObstacles(basePool(12, 3), 3);
    expect(body.missed).toBe(3);
    expect(body.loot).toBe(expected);
    expect(body.loot).toBe(1_980);
    expect(body.members.find((member) => member.classId === 'butcher')).toBeTruthy();

    const [still] = await ctx.db
      .select()
      .from(expeditionMembers)
      .where(eq(expeditionMembers.characterId, leader.characterId));
    expect(still?.classId).toBe('butcher');
  });

  it('asysta przed wyczerpaniem wejść odpada, a eskorta chce tego samego miasta', async () => {
    const leader = await registerPlayer(ctx);
    const helper = await registerPlayer(ctx);
    await level(leader.characterId, 12);
    await level(helper.characterId, 12);
    const created = await call(ctx, leader, 'POST', '/api/v1/expeditions', {
      body: { expeditionId: 'canals' },
    });
    const runId = created.json<{ id: string }>().id;
    const early = await call(ctx, helper, 'POST', `/api/v1/expeditions/${runId}/join`, {
      body: { assist: true },
    });
    expect(early.statusCode).toBe(409);

    const self = await call(ctx, leader, 'POST', '/api/v1/escorts', {
      body: { wardId: leader.characterId },
    });
    expect(self.statusCode).toBe(409);
    const offered = await call(ctx, leader, 'POST', '/api/v1/escorts', {
      body: { wardId: helper.characterId },
    });
    expect(offered.statusCode, offered.body).toBe(200);
    const escortId = offered.json<{ id: string }>().id;
    const accepted = await call(ctx, helper, 'POST', `/api/v1/escorts/${escortId}/accept`);
    expect(accepted.statusCode, accepted.body).toBe(200);

    const traveler = await registerPlayer(ctx);
    const local = await registerPlayer(ctx);
    await ctx.db
      .update(worldStates)
      .set({ city: 'ilmar' })
      .where(eq(worldStates.characterId, traveler.characterId));
    const abroad = await call(ctx, local, 'POST', '/api/v1/escorts', {
      body: { wardId: traveler.characterId },
    });
    expect(abroad.statusCode).toBe(409);
    expect(abroad.json<{ error: { message: string } }>().error.message).toContain('mieście');
  });

  it('walka na piętrze 50 dodaje 0,2 Skażenia, a setne piętro schodzi w Bezdeń', async () => {
    const player = await registerPlayer(ctx);
    await ctx.db
      .update(portalStates)
      .set({ wellFloor: 49 })
      .where(eq(portalStates.characterId, player.characterId));
    const fight = await call(ctx, player, 'POST', '/api/v1/well/fight');
    expect(fight.statusCode, fight.body).toBe(200);
    const [world] = await ctx.db
      .select()
      .from(worldStates)
      .where(eq(worldStates.characterId, player.characterId));
    expect(world?.contaminationTenths).toBe(2);

    const capped = await registerPlayer(ctx);
    await ctx.db
      .update(portalStates)
      .set({ wellFloor: 100, whisperUntilFloor: 105 })
      .where(eq(portalStates.characterId, capped.characterId));
    const descent = await call(ctx, capped, 'POST', '/api/v1/well/fight');
    expect(descent.statusCode, descent.body).toBe(200);
    expect(descent.json<{ result: { winner: string } }>().result.winner).not.toBe('player');
  });

  it('rozliczenie daje asyście reputację Zakonu, nie srebro', async () => {
    const leader = await registerPlayer(ctx);
    const second = await registerPlayer(ctx);
    const third = await registerPlayer(ctx);
    for (const player of [leader, second, third]) await level(player.characterId, 12);
    await silver(leader.characterId, 5_000);
    await silver(second.characterId, 5_000);
    await ctx.db.insert(expeditionEntries).values({
      characterId: third.characterId,
      defId: 'canals',
      weekKey: expeditionWeek(clock.now().getTime()),
      used: 5,
    });
    const created = await call(ctx, leader, 'POST', '/api/v1/expeditions', {
      body: { expeditionId: 'canals' },
    });
    const runId = created.json<{ id: string }>().id;
    const assist = await call(ctx, third, 'POST', `/api/v1/expeditions/${runId}/join`, {
      body: { assist: true },
    });
    expect(assist.statusCode, assist.body).toBe(200);
    const joined = await call(ctx, second, 'POST', `/api/v1/expeditions/${runId}/join`, {
      body: {},
    });
    expect(joined.statusCode, joined.body).toBe(200);
    for (const player of [leader, second, third]) {
      expect(
        (await call(ctx, player, 'POST', `/api/v1/expeditions/${runId}/ready`)).statusCode,
      ).toBe(200);
    }
    expect((await call(ctx, leader, 'POST', `/api/v1/expeditions/${runId}/start`)).statusCode).toBe(
      200,
    );
    clock.advance(HOUR_MS);
    const resolved = await call(ctx, leader, 'POST', `/api/v1/expeditions/${runId}/resolve`);
    expect(resolved.statusCode, resolved.body).toBe(200);
    const [lore] = await ctx.db
      .select()
      .from(loreStates)
      .where(eq(loreStates.characterId, third.characterId));
    expect(lore?.reputation.order).toBe(10);
    expect(lore?.seals.order ?? 0).toBe(0);
  });
});
