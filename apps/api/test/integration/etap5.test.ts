import { randomUUID } from 'node:crypto';

import { ORDER_LIFE_MS } from '@game/shared';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ManualClock } from '../../src/clock.js';
import {
  characters,
  itemInstances,
  marketFills,
  marketOrders,
  marketStates,
  walletEntries,
  workshopStates,
} from '../../src/db/schema.js';
import { postLedgerEntry, walletOf } from '../../src/game/wallet.js';
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

async function ledgerMatches(characterId: string) {
  const [row] = await ctx.db
    .select({ sum: sql<number>`coalesce(sum(${walletEntries.delta}), 0)::int` })
    .from(walletEntries)
    .where(eq(walletEntries.characterId, characterId));
  const wallet = await walletOf(ctx.db, characterId);
  expect(wallet.silver).toBe(row?.sum ?? 0);
  return wallet.silver;
}

describe('Etap 5 — port i rynek', () => {
  it('ten sam przedmiot nie wchodzi naraz do handlu i na licytację', async () => {
    const maker = await registerPlayer(ctx);
    const taker = await registerPlayer(ctx);
    await ctx.db.update(characters).set({ level: 10 }).where(eq(characters.id, maker.characterId));
    const [item] = await ctx.db
      .insert(itemInstances)
      .values({ characterId: maker.characterId, defId: 'gear.butcher.torso.1', quantity: 1 })
      .returning();
    const itemId = item?.id ?? '';
    const [auction, trade] = await Promise.all([
      call(ctx, maker, 'POST', '/api/v1/auctions', { body: { itemId, minBid: 10, buyNow: 40 } }),
      call(ctx, maker, 'POST', '/api/v1/trades', {
        body: { takerId: taker.characterId, itemId, silver: 0 },
      }),
    ]);
    const codes = [auction.statusCode, trade.statusCode].sort();
    expect(codes, `${auction.body}\n${trade.body}`).toEqual([200, 409]);
  });

  it('tysiąc równoległych kupna nie dubluje towaru, a salda zgadzają się z księgą', async () => {
    const seller = await registerPlayer(ctx);
    const buyer = await registerPlayer(ctx);
    await ctx.db
      .update(marketStates)
      .set({ goods: { 'crop:wormwood': 1000 } })
      .where(eq(marketStates.characterId, seller.characterId));
    await silver(seller.characterId, 2_000);
    await silver(buyer.characterId, 200_000);
    const listed = await call(ctx, seller, 'POST', '/api/v1/market/orders', {
      body: { goodId: 'crop:wormwood', side: 'sell', type: 'limit', price: 100, quantity: 1000 },
    });
    expect(listed.statusCode, listed.body).toBe(200);

    const buys = await Promise.all(
      Array.from({ length: 1000 }, () =>
        call(ctx, buyer, 'POST', '/api/v1/market/orders', {
          body: { goodId: 'crop:wormwood', side: 'buy', type: 'market', price: null, quantity: 1 },
        }),
      ),
    );
    const failed = buys.filter((response) => response.statusCode !== 200);
    expect(failed.map((response) => response.body)).toEqual([]);
    expect(buys.every((response) => response.json<{ fills: number }>().fills === 1)).toBe(true);

    const [sellerGoods] = await ctx.db
      .select()
      .from(marketStates)
      .where(eq(marketStates.characterId, seller.characterId));
    const [buyerGoods] = await ctx.db
      .select()
      .from(marketStates)
      .where(eq(marketStates.characterId, buyer.characterId));
    expect(sellerGoods?.goods['crop:wormwood'] ?? 0).toBe(0);
    expect(buyerGoods?.goods['crop:wormwood']).toBe(1000);

    // Vitest na czystym cache puszcza większe pliki pierwsze. Etap 9 zostawia
    // wtedy jeden fill piołunu, więc liczymy tylko transakcje tej pary.
    const fills = await ctx.db
      .select()
      .from(marketFills)
      .where(
        and(
          eq(marketFills.goodId, 'crop:wormwood'),
          eq(marketFills.sellerId, seller.characterId),
          eq(marketFills.buyerId, buyer.characterId),
        ),
      );
    expect(fills).toHaveLength(1000);
    expect(fills.reduce((sum, fill) => sum + fill.quantity, 0)).toBe(1000);
    const open = await ctx.db
      .select()
      .from(marketOrders)
      .where(
        and(
          eq(marketOrders.status, 'open'),
          eq(marketOrders.goodId, 'crop:wormwood'),
          eq(marketOrders.characterId, seller.characterId),
        ),
      );
    expect(open).toHaveLength(0);

    expect(await ledgerMatches(seller.characterId)).toBe(2_000 - 1_000 + 97_000);
    expect(await ledgerMatches(buyer.characterId)).toBe(200_000 - 100_000 - 1_000);
  }, 180_000);

  it('wygasłe zlecenie oddaje towar', async () => {
    const seller = await registerPlayer(ctx);
    await ctx.db
      .update(marketStates)
      .set({ goods: { 'crop:mandrake': 2 } })
      .where(eq(marketStates.characterId, seller.characterId));
    await silver(seller.characterId, 500);
    const listed = await call(ctx, seller, 'POST', '/api/v1/market/orders', {
      body: { goodId: 'crop:mandrake', side: 'sell', type: 'limit', price: 100, quantity: 2 },
    });
    expect(listed.statusCode, listed.body).toBe(200);
    clock.advance(ORDER_LIFE_MS + 1);
    const book = await call(ctx, seller, 'GET', '/api/v1/market?good=crop:mandrake');
    expect(book.statusCode, book.body).toBe(200);
    expect(book.json<{ asks: unknown[] }>().asks).toEqual([]);
    const [goods] = await ctx.db
      .select()
      .from(marketStates)
      .where(eq(marketStates.characterId, seller.characterId));
    expect(goods?.goods['crop:mandrake']).toBe(2);
  });

  it('Świeca Progu daje odłamek raz na dobę, a list wymaga poziomu 10', async () => {
    const smith = await registerPlayer(ctx);
    const early = await call(ctx, smith, 'POST', '/api/v1/workshops/candle');
    expect(early.statusCode).toBe(409);
    await ctx.db
      .update(workshopStates)
      .set({ levels: { candles: 5 } })
      .where(eq(workshopStates.characterId, smith.characterId));
    const lit = await call(ctx, smith, 'POST', '/api/v1/workshops/candle');
    expect(lit.statusCode, lit.body).toBe(200);
    const again = await call(ctx, smith, 'POST', '/api/v1/workshops/candle');
    expect(again.statusCode).toBe(409);

    const sender = await registerPlayer(ctx);
    const closed = await call(ctx, sender, 'POST', '/api/v1/mail', {
      body: { toId: smith.characterId, body: 'sól', silver: 0 },
    });
    expect(closed.statusCode).toBe(409);
    await ctx.db.update(characters).set({ level: 10 }).where(eq(characters.id, sender.characterId));
    await silver(sender.characterId, 30);
    const sent = await call(ctx, sender, 'POST', '/api/v1/mail', {
      body: { toId: smith.characterId, body: 'sól', silver: 10 },
    });
    expect(sent.statusCode, sent.body).toBe(200);
    const mailId = sent.json<{ mailId: string }>().mailId;
    const claimed = await call(ctx, smith, 'POST', `/api/v1/mail/${mailId}/claim`);
    expect(claimed.statusCode, claimed.body).toBe(200);
    expect(await ledgerMatches(smith.characterId)).toBe(10);
  });
});
