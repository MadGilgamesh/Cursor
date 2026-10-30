import { randomUUID } from 'node:crypto';

import { closeActDay, emptyActClock, lanternTax, PATRON_KEY_REGEN_MS } from '@game/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ManualClock } from '../../src/clock.js';
import {
  abyssPayouts,
  accounts,
  acts,
  characterStats,
  characters,
  itemInstances,
  lanternStates,
  lodges,
  marketStates,
  portalStates,
  resourceStates,
} from '../../src/db/schema.js';
import { paymentSignature } from '../../src/game/conjunction.js';
import { balanceOf, postLedgerEntry } from '../../src/game/wallet.js';
import { call, createTestApp, registerPlayer, type TestContext } from './harness.js';

let ctx: TestContext;
const clock = new ManualClock(Date.UTC(2026, 9, 29, 12));

beforeAll(async () => {
  ctx = await createTestApp({ clock });
});

afterAll(async () => {
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  await ctx.db.delete(acts);
  await ctx.db.delete(abyssPayouts);
  await ctx.db.delete(lanternStates);
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

async function armForAbyss(characterId: string, playerToken: Parameters<typeof call>[1]) {
  const tutorial = await call(ctx, playerToken, 'POST', '/api/v1/tutorial');
  expect(tutorial.statusCode, tutorial.body).toBe(200);
  await ctx.db
    .update(itemInstances)
    .set({ qualityBp: 5_000_000 })
    .where(eq(itemInstances.characterId, characterId));
  const items = await call(ctx, playerToken, 'GET', '/api/v1/inventory');
  const weapon = items
    .json<{ items: { id: string; defId: string; equippedSlot: string | null }[] }>()
    .items.find((item) => item.defId.includes('weapon'));
  expect(weapon).toBeTruthy();
  if (weapon && !weapon.equippedSlot) {
    const equipped = await call(ctx, playerToken, 'POST', '/api/v1/inventory/equip', {
      body: { itemId: weapon.id },
    });
    expect(equipped.statusCode, equipped.body).toBe(200);
  }
  await ctx.db
    .update(resourceStates)
    .set({ life: 1_000_000 })
    .where(eq(resourceStates.characterId, characterId));
}

async function wax(characterId: string, delta: number) {
  await postLedgerEntry(ctx.db, {
    characterId,
    currency: 'wax',
    delta,
    reason: 'test',
    idempotencyKey: randomUUID(),
  });
}

describe('Etap 9 — Koniunkcja, Latarnie, Bezdeń i Patronat', () => {
  it('przyspieszony akt z dwoma botami kończy się raz i nie wypłaca drugi raz', async () => {
    const left = await registerPlayer(ctx);
    const right = await registerPlayer(ctx);
    const started = await call(ctx, left, 'POST', '/api/v1/conjunction/start', {
      body: { pace: 'accelerated' },
    });
    expect(started.statusCode, started.body).toBe(200);

    for (let day = 0; day < 56; day += 1) {
      for (const bot of [left, right]) {
        const noted = await call(ctx, bot, 'POST', '/api/v1/conjunction/contribute', {
          body: { action: 'seriousCase' },
        });
        expect(noted.statusCode, noted.body).toBe(200);
        expect(noted.json<{ accepted: number }>().accepted).toBe(5);
      }
      clock.advance(60_000);
    }

    let expected = emptyActClock();
    for (let day = 0; day < 56; day += 1) {
      expected = closeActDay(expected, 10, 0, 2).state;
    }
    const view = await call(ctx, left, 'GET', '/api/v1/conjunction');
    expect(view.statusCode, view.body).toBe(200);
    const body = view.json<{ clockBp: number; finale: string; thresholds: number[] }>();
    expect(body.clockBp).toBe(expected.clockBp);
    expect(body.finale).toBe('repelled');
    expect(body.thresholds).toEqual([2_500, 5_000]);
    expect(expected.finale).toBe('repelled');

    for (const bot of [left, right]) {
      const [portal] = await ctx.db
        .select()
        .from(portalStates)
        .where(eq(portalStates.characterId, bot.characterId));
      expect(portal?.sigils['9']).toBe(5);
      expect(portal?.lootKeys).toBe(6);
    }

    const again = await call(ctx, left, 'GET', '/api/v1/conjunction');
    expect(again.json<{ clockBp: number }>().clockBp).toBe(body.clockBp);
    for (const bot of [left, right]) {
      const [portal] = await ctx.db
        .select()
        .from(portalStates)
        .where(eq(portalStates.characterId, bot.characterId));
      expect(portal?.sigils['9']).toBe(5);
      expect(portal?.lootKeys).toBe(6);
    }
  });

  it('Pieczęć Patrona schodzi z giełdy, a Pęk Patrona tyka co 3,5 h', async () => {
    const seller = await registerPlayer(ctx);
    const buyer = await registerPlayer(ctx);
    const stranger = await registerPlayer(ctx);
    await silver(seller.characterId, 40_000);
    await silver(buyer.characterId, 5_000);
    const bought = await call(ctx, seller, 'POST', '/api/v1/patron/seal');
    expect(bought.statusCode, bought.body).toBe(200);
    const listed = await call(ctx, seller, 'POST', '/api/v1/market/orders', {
      body: { goodId: 'seal:patron', side: 'sell', type: 'limit', price: 1_000, quantity: 1 },
    });
    expect(listed.statusCode, listed.body).toBe(200);
    const filled = await call(ctx, buyer, 'POST', '/api/v1/market/orders', {
      body: { goodId: 'seal:patron', side: 'buy', type: 'market', price: null, quantity: 1 },
    });
    expect(filled.statusCode, filled.body).toBe(200);
    expect(filled.json<{ fills: number }>().fills).toBe(1);
    const redeemed = await call(ctx, buyer, 'POST', '/api/v1/patron/redeem');
    expect(redeemed.statusCode, redeemed.body).toBe(200);
    const dash = await call(ctx, buyer, 'GET', '/api/v1/dashboard');
    expect(dash.json<{ resources: { vigor: { max: number } } }>().resources.vigor.max).toBe(200);

    const denied = await call(ctx, stranger, 'POST', '/api/v1/trades', {
      body: { takerId: seller.characterId, itemId: randomUUID(), silver: 0 },
    });
    expect(denied.statusCode).toBe(409);
    expect(denied.json<{ error: { message: string } }>().error.message).toContain('poziomu 10');
    await ctx.db
      .update(characters)
      .set({ patronUntil: new Date(clock.now().getTime() + 10 * 24 * 60 * 60 * 1000) })
      .where(eq(characters.id, stranger.characterId));
    const missing = await call(ctx, stranger, 'POST', '/api/v1/trades', {
      body: { takerId: seller.characterId, itemId: randomUUID(), silver: 0 },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<{ error: { message: string } }>().error.message).toContain(
      'Nie masz tego przedmiotu',
    );

    const anchor = clock.now();
    await ctx.db
      .update(portalStates)
      .set({ regenKeys: 0, regenUpdatedAt: anchor })
      .where(eq(portalStates.characterId, buyer.characterId));
    await ctx.db
      .update(portalStates)
      .set({ regenKeys: 0, regenUpdatedAt: anchor })
      .where(eq(portalStates.characterId, seller.characterId));
    clock.advance(PATRON_KEY_REGEN_MS);
    const patronKeys = await call(ctx, buyer, 'GET', '/api/v1/dashboard');
    const plainKeys = await call(ctx, seller, 'GET', '/api/v1/dashboard');
    expect(patronKeys.json<{ portal: { regenKeys: number } }>().portal.regenKeys).toBe(1);
    expect(plainKeys.json<{ portal: { regenKeys: number } }>().portal.regenKeys).toBe(0);
  });

  it('Bezdeń zapisuje piętro, a tygodniowa wypłata Sigili nie dubluje się', async () => {
    const first = await registerPlayer(ctx);
    const second = await registerPlayer(ctx);
    for (const player of [first, second]) {
      await armForAbyss(player.characterId, player);
      await ctx.db
        .update(characterStats)
        .set({
          strength: 20_000_000,
          defense: 20_000_000,
          accuracy: 20_000_000,
          evasion: 20_000_000,
        })
        .where(eq(characterStats.characterId, player.characterId));
    }
    await ctx.db
      .update(portalStates)
      .set({ wellFloor: 100, whisperUntilFloor: 105 })
      .where(eq(portalStates.characterId, first.characterId));
    const won = await call(ctx, first, 'POST', '/api/v1/well/fight');
    expect(won.statusCode, won.body).toBe(200);
    expect(won.json<{ floor: number; result: { winner: string } }>().floor).toBe(101);
    expect(won.json<{ result: { winner: string } }>().result.winner).toBe('player');

    await ctx.db
      .update(portalStates)
      .set({ wellFloor: 101, whisperUntilFloor: 105 })
      .where(eq(portalStates.characterId, second.characterId));
    const deeper = await call(ctx, second, 'POST', '/api/v1/well/fight');
    expect(deeper.statusCode, deeper.body).toBe(200);
    expect(deeper.json<{ floor: number }>().floor).toBe(102);

    const board = await call(ctx, first, 'GET', '/api/v1/well/abyss');
    expect(board.statusCode, board.body).toBe(200);
    const ranks = board.json<{ board: { floor: number }[] }>().board;
    expect(ranks[0]?.floor).toBe(102);
    expect(ranks[1]?.floor).toBe(101);

    const paid = await call(ctx, first, 'POST', '/api/v1/well/abyss/payout');
    expect(paid.statusCode, paid.body).toBe(200);
    expect(paid.json<{ paid: boolean }>().paid).toBe(true);
    const again = await call(ctx, first, 'POST', '/api/v1/well/abyss/payout');
    expect(again.json<{ paid: boolean }>().paid).toBe(false);

    const [lead] = await ctx.db
      .select()
      .from(portalStates)
      .where(eq(portalStates.characterId, second.characterId));
    const [follow] = await ctx.db
      .select()
      .from(portalStates)
      .where(eq(portalStates.characterId, first.characterId));
    expect(lead?.sigils['9']).toBe(3);
    expect(follow?.sigils['9']).toBe(2);
  });

  it('pusta Latarnia soli przechodzi bez bitwy i bierze podatek z giełdy', async () => {
    const master = await registerPlayer(ctx);
    const buyer = await registerPlayer(ctx);
    const founded = await call(ctx, master, 'POST', '/api/v1/lodges', {
      body: { name: 'Sól Latarni' },
    });
    expect(founded.statusCode, founded.body).toBe(200);
    const lodgeId = founded.json<{ id: string }>().id;
    const applied = await call(ctx, master, 'POST', '/api/v1/lanterns/ulthaeg/apply', {
      body: { defense: 4_000 },
    });
    expect(applied.statusCode, applied.body).toBe(200);
    const sunday = Date.UTC(2026, 10, 1, 12);
    clock.advance(sunday - clock.now().getTime());
    const resolved = await call(ctx, master, 'POST', '/api/v1/lanterns/resolve');
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json<{ resolved: boolean }>().resolved).toBe(true);
    const [lantern] = await ctx.db
      .select()
      .from(lanternStates)
      .where(eq(lanternStates.sleeperId, 'ulthaeg'));
    expect(lantern?.status).toBe('held');
    expect(lantern?.lodgeId).toBe(lodgeId);

    await ctx.db
      .update(marketStates)
      .set({ goods: { 'crop:wormwood': 1 } })
      .where(eq(marketStates.characterId, master.characterId));
    await silver(master.characterId, 1_000);
    await silver(buyer.characterId, 5_000);
    const listed = await call(ctx, master, 'POST', '/api/v1/market/orders', {
      body: { goodId: 'crop:wormwood', side: 'sell', type: 'limit', price: 1_000, quantity: 1 },
    });
    expect(listed.statusCode, listed.body).toBe(200);
    const filled = await call(ctx, buyer, 'POST', '/api/v1/market/orders', {
      body: { goodId: 'crop:wormwood', side: 'buy', type: 'market', price: null, quantity: 1 },
    });
    expect(filled.statusCode, filled.body).toBe(200);
    const [lodge] = await ctx.db.select().from(lodges).where(eq(lodges.id, lodgeId));
    expect(lodge?.treasury).toBe(lanternTax(1_000));
  });

  it('polecenie po weryfikacji i 15. poziomie daje tytuł Świadka', async () => {
    const referrer = await registerPlayer(ctx);
    const referred = await registerPlayer(ctx);
    const [account] = await ctx.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, referrer.accountId));
    expect(account?.referralCode).toHaveLength(8);
    const bound = await call(ctx, referred, 'POST', '/api/v1/referrals', {
      body: { code: account?.referralCode },
    });
    expect(bound.statusCode, bound.body).toBe(200);
    const self = await call(ctx, referrer, 'POST', '/api/v1/referrals', {
      body: { code: account?.referralCode },
    });
    expect(self.statusCode).toBe(409);
    await ctx.db
      .update(characters)
      .set({ level: 15 })
      .where(eq(characters.id, referred.characterId));
    const early = await call(ctx, referrer, 'GET', '/api/v1/referrals');
    expect(early.json<{ qualified: number }>().qualified).toBe(0);
    await ctx.db
      .update(accounts)
      .set({ emailVerifiedAt: clock.now() })
      .where(eq(accounts.id, referred.accountId));
    const later = await call(ctx, referrer, 'GET', '/api/v1/referrals');
    expect(later.json<{ qualified: number; titles: string[] }>().qualified).toBe(1);
    expect(later.json<{ titles: string[] }>().titles).toContain('Świadek');
  });

  it('katedra w Soli zaślubia, a pakt krwi i sam zaślubek odpadają', async () => {
    const left = await registerPlayer(ctx);
    const right = await registerPlayer(ctx);
    const self = await call(ctx, left, 'POST', '/api/v1/marriages', {
      body: { partnerId: left.characterId, rite: 'cathedral' },
    });
    expect(self.statusCode).toBe(409);
    const blood = await call(ctx, left, 'POST', '/api/v1/marriages', {
      body: { partnerId: right.characterId, rite: 'blood' },
    });
    expect(blood.statusCode).toBe(409);
    const offered = await call(ctx, left, 'POST', '/api/v1/marriages', {
      body: { partnerId: right.characterId, rite: 'cathedral' },
    });
    expect(offered.statusCode, offered.body).toBe(200);
    const id = offered.json<{ id: string }>().id;
    const wed = await call(ctx, right, 'POST', `/api/v1/marriages/${id}/accept`);
    expect(wed.statusCode, wed.body).toBe(200);
    const [row] = await ctx.db
      .select()
      .from(characters)
      .where(eq(characters.id, right.characterId));
    expect(row?.titles).toContain('Zaślubieni');
  });

  it('Noc Zmarłych daje wosk i trzy klucze, a Perły odpadają', async () => {
    const player = await registerPlayer(ctx);
    const claimed = await call(ctx, player, 'POST', '/api/v1/events/dead/claim');
    expect(claimed.statusCode, claimed.body).toBe(200);
    expect(await balanceOf(ctx.db, player.characterId, 'wax')).toBe(10);
    const pearls = await call(ctx, player, 'POST', '/api/v1/events/dead/buy', {
      body: { sku: 'keys', paidWith: 'pearls' },
    });
    expect(pearls.statusCode).toBe(409);
    await wax(player.characterId, 90);
    for (let index = 0; index < 3; index += 1) {
      const bought = await call(ctx, player, 'POST', '/api/v1/events/dead/buy', {
        body: { sku: 'keys', paidWith: 'wax' },
      });
      expect(bought.statusCode, bought.body).toBe(200);
    }
    const fourth = await call(ctx, player, 'POST', '/api/v1/events/dead/buy', {
      body: { sku: 'keys', paidWith: 'wax' },
    });
    expect(fourth.statusCode).toBe(409);
    const [portal] = await ctx.db
      .select()
      .from(portalStates)
      .where(eq(portalStates.characterId, player.characterId));
    expect(portal?.lootKeys).toBe(3);
  });

  it('paragon pereł księguje się raz, a zły podpis odpada', async () => {
    const player = await registerPlayer(ctx);
    const checkout = await call(ctx, player, 'POST', '/api/v1/payments/checkout', {
      body: { sku: 'pearls-10' },
    });
    expect(checkout.statusCode, checkout.body).toBe(200);
    const receiptId = checkout.json<{ receiptId: string }>().receiptId;
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    const closed = await call(ctx, player, 'POST', '/api/v1/payments/confirm', {
      body: { receiptId, signature: 'nie' },
    });
    expect(closed.statusCode).toBe(503);
    process.env.PAYMENT_WEBHOOK_SECRET = 'sekret-proby';
    const forged = await call(ctx, player, 'POST', '/api/v1/payments/confirm', {
      body: { receiptId, signature: 'nie' },
    });
    expect(forged.statusCode).toBe(403);
    const signature = paymentSignature(receiptId, 'sekret-proby');
    const paid = await call(ctx, player, 'POST', '/api/v1/payments/confirm', {
      body: { receiptId, signature },
    });
    expect(paid.statusCode, paid.body).toBe(200);
    const replay = await call(ctx, player, 'POST', '/api/v1/payments/confirm', {
      body: { receiptId, signature },
    });
    expect(replay.json<{ replayed: boolean }>().replayed).toBe(true);
    expect(await balanceOf(ctx.db, player.characterId, 'pearls')).toBe(10);
  });
});
