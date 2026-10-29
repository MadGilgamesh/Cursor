import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ManualClock } from '../../src/clock.js';
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

/** Test akceptacyjny Etapu 1 (GDD 11): poziom 5, zestaw klasy i zlecenie w pętli. */
describe('Etap 1 — pierwsza noc w Soli', () => {
  it('nowy gracz dochodzi do 5. poziomu, zakłada Rzeźnika i ustawia zlecenie w pętli', async () => {
    const player = await registerPlayer(ctx);
    const tutorial = await call(ctx, player, 'POST', '/api/v1/tutorial');
    expect(tutorial.statusCode).toBe(200);
    expect(tutorial.json<{ result: { winner: string } }>().result.winner).toBe('player');
    for (const stat of ['strength', 'defense', 'accuracy', 'evasion']) {
      expect(
        (await call(ctx, player, 'POST', '/api/v1/training', { body: { stat, vigor: 20 } }))
          .statusCode,
      ).toBe(200);
    }

    let level = 1;
    for (let i = 0; i < 20 && level < 5; i++) {
      const board = await call(ctx, player, 'GET', '/api/v1/hunts');
      const targets = board.json<{ targets: { index: number; floor: number; named: boolean }[] }>()
        .targets;
      const easiest = targets
        .filter((target) => !target.named)
        .sort((a, b) => a.floor - b.floor)[0];
      const fight = await call(ctx, player, 'POST', '/api/v1/hunts/fight', {
        body: { index: easiest?.index ?? 0 },
      });
      if (fight.statusCode === 409) {
        clock.advance(60 * 60_000);
        continue;
      }
      expect(fight.statusCode, fight.body).toBe(200);
      const me = await call(ctx, player, 'GET', '/api/v1/me');
      level = me.json<{ character: { level: number } }>().character.level;
    }
    expect(level).toBeGreaterThanOrEqual(5);

    let silver = 0;
    for (let i = 0; i < 15 && silver < 250; i++) {
      const board = await call(ctx, player, 'GET', '/api/v1/hunts');
      const targets = board.json<{ targets: { index: number; floor: number; named: boolean }[] }>()
        .targets;
      const easiest = targets
        .filter((target) => !target.named)
        .sort((a, b) => a.floor - b.floor)[0];
      const fight = await call(ctx, player, 'POST', '/api/v1/hunts/fight', {
        body: { index: easiest?.index ?? 0 },
      });
      if (fight.statusCode === 409) clock.advance(60 * 60_000);
      silver = (await call(ctx, player, 'GET', '/api/v1/profile')).json<{
        wallet: { silver: number };
      }>().wallet.silver;
    }
    expect(silver).toBeGreaterThanOrEqual(200);

    for (const slot of ['head', 'torso', 'legs', 'hands']) {
      const bought = await call(ctx, player, 'POST', '/api/v1/shop/buy', {
        body: { itemId: `gear.butcher.${slot}.1` },
      });
      if (bought.statusCode !== 200) throw new Error(JSON.stringify(bought.json()));
    }
    const items = await call(ctx, player, 'GET', '/api/v1/inventory');
    for (const item of items.json<{
      items: { id: string; defId: string; equippedSlot: string | null }[];
    }>().items) {
      if (item.defId.startsWith('gear.') && !item.equippedSlot) {
        const equipped = await call(ctx, player, 'POST', '/api/v1/inventory/equip', {
          body: { itemId: item.id },
        });
        if (equipped.statusCode !== 200) throw new Error(JSON.stringify(equipped.json()));
      }
    }
    const profile = await call(ctx, player, 'GET', '/api/v1/profile');
    expect(profile.json<{ classId: string | null }>().classId).toBe('butcher');

    clock.advance(3 * 60 * 60_000);
    const mission = await call(ctx, player, 'POST', '/api/v1/activities', {
      body: { missionId: 'order.quay-patrol', loop: true },
    });
    expect(mission.statusCode, mission.body).toBe(201);
  });
});
