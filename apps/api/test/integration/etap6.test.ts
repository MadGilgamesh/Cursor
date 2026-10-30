import { randomUUID } from 'node:crypto';

import { SUMMON_SIGNUP_MS } from '@game/shared';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ManualClock } from '../../src/clock.js';
import {
  awakeningReceipts,
  awakeningRuns,
  characterStats,
  characters,
  portalStates,
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

async function cycle(name: string) {
  const master = await registerPlayer(ctx);
  const members: Player[] = [];
  for (let i = 0; i < 9; i++) members.push(await registerPlayer(ctx));
  const created = await call(ctx, master, 'POST', '/api/v1/lodges', { body: { name } });
  expect(created.statusCode).toBe(200);
  const lodgeId = created.json<{ id: string }>().id;
  for (const member of members) {
    expect((await call(ctx, member, 'POST', `/api/v1/lodges/${lodgeId}/join`)).statusCode).toBe(
      200,
    );
  }
  const novice = members[0];
  if (!novice) throw new Error('brak nowicjusza');
  expect(
    (await call(ctx, novice, 'POST', `/api/v1/lodges/${lodgeId}/scrolls`, { body: { tier: 1 } }))
      .statusCode,
  ).toBe(409);

  const everyone = [master, ...members];
  for (const player of everyone) await silver(player.characterId, 5_000);
  for (const player of everyone) {
    expect(
      (
        await call(ctx, player, 'POST', `/api/v1/lodges/${lodgeId}/donate`, {
          body: { silver: 5_000 },
        })
      ).statusCode,
    ).toBe(200);
  }
  for (const member of members.slice(1)) {
    expect(
      (
        await call(ctx, master, 'POST', `/api/v1/lodges/${lodgeId}/roles`, {
          body: { characterId: member.characterId, role: 'sibling' },
        })
      ).statusCode,
    ).toBe(200);
  }
  expect(
    (
      await call(ctx, master, 'POST', `/api/v1/lodges/${lodgeId}/roles`, {
        body: { characterId: novice.characterId, role: 'treasurer' },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await call(ctx, novice, 'POST', `/api/v1/lodges/${lodgeId}/scrolls`, { body: { tier: 1 } }))
      .statusCode,
  ).toBe(409);
  expect(
    (
      await call(ctx, master, 'POST', `/api/v1/lodges/${lodgeId}/skills`, {
        body: { skill: 'keykeeper' },
      })
    ).statusCode,
  ).toBe(200);
  const [cap] = await ctx.db
    .select()
    .from(portalStates)
    .where(eq(portalStates.characterId, members[1]?.characterId ?? master.characterId));
  expect(cap?.keyCap).toBe(7);

  const scroll = await call(ctx, master, 'POST', `/api/v1/lodges/${lodgeId}/scrolls`, {
    body: { tier: 1 },
  });
  expect(scroll.statusCode).toBe(200);
  const summonId = scroll.json<{ summonId: string }>().summonId;
  for (const player of everyone) {
    expect(
      (await call(ctx, player, 'POST', `/api/v1/lodges/${lodgeId}/summons/${summonId}/signup`))
        .statusCode,
    ).toBe(200);
  }
  clock.advance(SUMMON_SIGNUP_MS + 1);
  const resolved = await call(
    ctx,
    master,
    'POST',
    `/api/v1/lodges/${lodgeId}/summons/${summonId}/resolve`,
  );
  expect(resolved.statusCode).toBe(200);
  const body = resolved.json<{ won: boolean; signups: number; sigilRecipients: string[] }>();
  expect(body.won).toBe(true);
  expect(body.signups).toBe(10);
  expect(body.sigilRecipients).toHaveLength(1);
  const rows = await ctx.db
    .select()
    .from(portalStates)
    .where(
      inArray(
        portalStates.characterId,
        everyone.map((player) => player.characterId),
      ),
    );
  const sigils = rows.reduce(
    (sum, row) => sum + Object.values(row.sigils).reduce((inner, value) => inner + value, 0),
    0,
  );
  expect(sigils).toBe(1);
  const again = await call(
    ctx,
    master,
    'POST',
    `/api/v1/lodges/${lodgeId}/summons/${summonId}/resolve`,
  );
  expect(again.statusCode).toBe(200);
  const after = await ctx.db
    .select()
    .from(portalStates)
    .where(
      inArray(
        portalStates.characterId,
        everyone.map((player) => player.characterId),
      ),
    );
  const sigilsAgain = after.reduce(
    (sum, row) => sum + Object.values(row.sigils).reduce((inner, value) => inner + value, 0),
    0,
  );
  expect(sigilsAgain).toBe(1);
}

describe('Etap 6 — loże i Przebudzenie', () => {
  it('dwie loże po dziesięć kont: darowizna, zwój, rytuał, podział', async () => {
    await cycle(`Loża_${randomUUID().slice(0, 8)}`);
    await cycle(`Loża_${randomUUID().slice(0, 8)}`);
  }, 180_000);

  it('wypłata Przebudzenia idzie raz na tydzień, a Domena się zmienia', async () => {
    const first = await registerPlayer(ctx);
    const second = await registerPlayer(ctx);
    const view = await call(ctx, first, 'GET', '/api/v1/awakening');
    expect(view.statusCode).toBe(200);
    const before = view.json<{ week: string; domain: number }>();
    const sigils = Object.fromEntries([1, 2, 3, 4, 5, 6].map((domain) => [String(domain), 5]));
    for (const player of [first, second]) {
      await ctx.db
        .update(characters)
        .set({ level: 80 })
        .where(eq(characters.id, player.characterId));
      await ctx.db
        .update(characterStats)
        .set({
          strength: 50_000_000,
          defense: 50_000_000,
          accuracy: 50_000_000,
          evasion: 50_000_000,
        })
        .where(eq(characterStats.characterId, player.characterId));
      await ctx.db
        .update(portalStates)
        .set({ clearedDomain: 6, sigils })
        .where(eq(portalStates.characterId, player.characterId));
    }
    // Awatar nie pada od gołych pięści w 25 rundach. Ranking jest daną wejściową, wypłatę liczy serwer.
    const climb = await call(ctx, first, 'POST', '/api/v1/awakening/climb');
    expect(climb.statusCode).toBe(200);
    expect(climb.json<{ week: string }>().week).toBe(before.week);
    await ctx.db.delete(awakeningRuns).where(eq(awakeningRuns.weekStart, before.week));
    await ctx.db.insert(awakeningRuns).values([
      { weekStart: before.week, characterId: first.characterId, level: 2 },
      { weekStart: before.week, characterId: second.characterId, level: 1 },
    ]);
    clock.advance(8 * 24 * 60 * 60_000);
    const settled = await call(ctx, first, 'POST', '/api/v1/awakening/settle');
    expect(settled.statusCode).toBe(200);
    expect(settled.json<{ paid: string[] }>().paid).toContain(before.week);
    const [lead] = await ctx.db
      .select()
      .from(awakeningReceipts)
      .where(eq(awakeningReceipts.characterId, first.characterId));
    const [follow] = await ctx.db
      .select()
      .from(awakeningReceipts)
      .where(eq(awakeningReceipts.characterId, second.characterId));
    expect(lead?.amount).toBe(3);
    expect(follow?.amount).toBe(1);
    const repeat = await call(ctx, second, 'POST', '/api/v1/awakening/settle');
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json<{ paid: string[] }>().paid).toEqual([]);
    const [leadAgain] = await ctx.db
      .select()
      .from(awakeningReceipts)
      .where(eq(awakeningReceipts.characterId, first.characterId));
    expect(leadAgain?.amount).toBe(3);
    const after = await call(ctx, first, 'GET', '/api/v1/awakening');
    expect(after.json<{ domain: number }>().domain).not.toBe(before.domain);
  }, 60_000);
});
