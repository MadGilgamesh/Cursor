/**
 * Giełda Portowa, licytacje, handel, poczta, warsztaty i czat (GDD 5.15, Etap 5).
 * Księga jednego towaru jest blokowana na czas dopasowania, więc fill nie dubluje się.
 */
import { randomUUID } from 'node:crypto';

import {
  CANDLE_INTERVAL_MS,
  CANDLE_LEVEL,
  CRATE_BASE_SLOTS,
  ERROR_CODES,
  HOUR_MS,
  MINUTE_MS,
  MOUNTS,
  ORDER_LIFE_MS,
  TRADE_MIN_LEVEL,
  WORKSHOP_MAX_LEVEL,
  adjustResource,
  lanternCity,
  lanternTax,
  listingFee,
  matchOrder,
  patronActive,
  resourceMax,
  sellerFee,
  smugglePrice,
  tradableGood,
  workshopUpgradeCost,
  type IncomingOrder,
  type MountId,
  type RestingOrder,
} from '@game/shared';
import { and, desc, eq, sql } from 'drizzle-orm';

import { writeAudit, type AuditActor } from '../audit.js';
import type { Clock } from '../clock.js';
import type { Executor } from '../db/client.js';
import {
  auctions,
  characters,
  chatBlocks,
  chatMessages,
  chatReports,
  directTrades,
  friendships,
  itemInstances,
  lanternStates,
  lodges,
  mails,
  marketBooks,
  marketFills,
  marketOrders,
  marketStates,
  workshopStates,
  type CharacterRow,
} from '../db/schema.js';
import { AppError } from '../errors.js';
import { lockCharacter } from './activities.js';
import { loadLore } from './lore-state.js';
import { grantKeyShards } from './portal-state.js';
import { loadResources, materializeAll, resourceContext, saveResources } from './resources.js';
import { InsufficientFundsError, postLedgerEntry } from './wallet.js';
import { loadWorld, saveWorld } from './world-state.js';

const audit = (
  db: Executor,
  who: AuditActor,
  characterId: string,
  action: string,
  after: unknown,
) => writeAudit(db, who, { action, characterId, after });

async function lockIds(db: Executor, ids: readonly string[]): Promise<void> {
  for (const id of [...new Set(ids)].sort()) {
    const [row] = await db
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.id, id))
      .for('update');
    if (!row) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej postaci');
  }
}

async function lockBook(db: Executor, goodId: string): Promise<void> {
  await db.insert(marketBooks).values({ goodId }).onConflictDoNothing();
  await db.select().from(marketBooks).where(eq(marketBooks.goodId, goodId)).for('update');
}

async function pay(db: Executor, characterId: string, amount: number, key: string, reason: string) {
  if (amount === 0) return;
  try {
    await postLedgerEntry(db, {
      characterId,
      currency: 'silver',
      delta: -amount,
      reason,
      idempotencyKey: key,
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało srebra');
    }
    throw error;
  }
}

async function credit(
  db: Executor,
  characterId: string,
  amount: number,
  key: string,
  reason: string,
) {
  if (amount <= 0) return;
  await postLedgerEntry(db, {
    characterId,
    currency: 'silver',
    delta: amount,
    reason,
    idempotencyKey: key,
  });
}

export async function changeStock(
  db: Executor,
  characterId: string,
  goodId: string,
  delta: number,
) {
  const [row] = await db
    .select()
    .from(marketStates)
    .where(eq(marketStates.characterId, characterId))
    .for('update');
  if (!row) throw new Error(`Postać ${characterId} nie ma stanu giełdy`);
  const have = row.goods[goodId] ?? 0;
  const next = have + delta;
  if (next < 0) throw new AppError(409, ERROR_CODES.requirement, 'Za mało towaru');
  const goods = Object.fromEntries(
    Object.entries({ ...row.goods, [goodId]: next }).filter(([, qty]) => qty > 0),
  );
  await db.update(marketStates).set({ goods }).where(eq(marketStates.characterId, characterId));
}

async function loadOpen(db: Executor, goodId: string) {
  return db
    .select()
    .from(marketOrders)
    .where(and(eq(marketOrders.goodId, goodId), eq(marketOrders.status, 'open')));
}

export async function placeOrder(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  input: {
    goodId: string;
    side: 'buy' | 'sell';
    type: 'limit' | 'market';
    price: number | null;
    quantity: number;
  },
) {
  if (!tradableGood(input.goodId)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Tego nie wystawia się na giełdzie');
  }
  if (input.quantity < 1 || input.quantity > 10_000) {
    throw new AppError(409, ERROR_CODES.requirement, 'Zła ilość');
  }
  if (
    input.type === 'limit' &&
    (input.price === null || input.price < 1 || input.price > 1_000_000)
  ) {
    throw new AppError(409, ERROR_CODES.requirement, 'Zła cena');
  }
  const now = clock.now();
  const orderId = randomUUID();
  await lockBook(db, input.goodId);
  const peek = await loadOpen(db, input.goodId);
  await lockIds(db, [character.id, ...peek.map((order) => order.characterId)]);
  const open = await loadOpen(db, input.goodId);
  for (const order of open) {
    if (order.expiresAt <= now) await expireOrder(db, order.id);
  }
  const live = (await loadOpen(db, input.goodId)).filter((order) => order.expiresAt > now);
  const limitPrice = input.type === 'limit' ? input.price : null;
  if (input.type === 'limit' && limitPrice !== null) {
    const fee = listingFee(limitPrice * input.quantity);
    await pay(db, character.id, fee, `list:${orderId}`, 'market.list');
    if (input.side === 'buy') {
      await pay(
        db,
        character.id,
        limitPrice * input.quantity,
        `escrow:${orderId}`,
        'market.escrow',
      );
    }
  }
  if (input.side === 'sell') await changeStock(db, character.id, input.goodId, -input.quantity);

  const incoming: IncomingOrder = {
    id: orderId,
    characterId: character.id,
    side: input.side,
    type: input.type,
    price: limitPrice,
    quantity: input.quantity,
    createdAt: now.getTime(),
  };
  const resting: RestingOrder[] = live.map((order) => ({
    id: order.id,
    characterId: order.characterId,
    side: order.side === 'buy' ? 'buy' : 'sell',
    price: order.price ?? 0,
    remaining: order.remaining,
    createdAt: order.createdAt.getTime(),
  }));
  const matched = matchOrder(resting, incoming);
  const saltLodge = await saltLanternLodge(db);
  let marketNotional = 0;
  for (const fill of matched.fills) {
    const fillId = randomUUID();
    await db.insert(marketFills).values({
      id: fillId,
      goodId: input.goodId,
      buyOrderId: fill.buyOrderId,
      sellOrderId: fill.sellOrderId,
      buyerId: fill.buyerId,
      sellerId: fill.sellerId,
      price: fill.price,
      quantity: fill.quantity,
    });
    await changeStock(db, fill.buyerId, input.goodId, fill.quantity);
    const gross = fill.price * fill.quantity;
    const tax = saltLodge ? lanternTax(gross) : 0;
    const net = gross - sellerFee(gross) - tax;
    if (tax > 0 && saltLodge) {
      await db
        .update(lodges)
        .set({ treasury: sql`${lodges.treasury} + ${tax}` })
        .where(eq(lodges.id, saltLodge));
    }
    await credit(db, fill.sellerId, net, `fill:${fillId}:sell`, 'market.sell');
    const restingBuy = live.find((order) => order.id === fill.buyOrderId);
    if (restingBuy?.price) {
      const spread = (restingBuy.price - fill.price) * fill.quantity;
      await credit(db, fill.buyerId, spread, `fill:${fillId}:spread`, 'market.spread');
    } else if (input.side === 'buy' && input.type === 'market') {
      await pay(db, character.id, gross, `fill:${fillId}:buy`, 'market.buy');
      marketNotional += gross;
    } else if (input.side === 'buy' && limitPrice !== null) {
      const spread = (limitPrice - fill.price) * fill.quantity;
      await credit(db, character.id, spread, `fill:${fillId}:spread`, 'market.spread');
    }
  }
  if (input.type === 'market' && marketNotional > 0) {
    await pay(db, character.id, listingFee(marketNotional), `list:${orderId}`, 'market.list');
  }
  if (input.side === 'sell' && input.type === 'market' && matched.unfilled > 0) {
    await changeStock(db, character.id, input.goodId, matched.unfilled);
  }
  for (const order of live) {
    const next = matched.resting.find((entry) => entry.id === order.id);
    await db
      .update(marketOrders)
      .set({
        remaining: next?.remaining ?? 0,
        status: next ? 'open' : 'filled',
        escrowSilver:
          order.side === 'buy' && next && order.price ? order.price * next.remaining : 0,
      })
      .where(eq(marketOrders.id, order.id));
  }
  const left = matched.resting.find((entry) => entry.id === orderId);
  if (left) {
    await db.insert(marketOrders).values({
      id: orderId,
      characterId: character.id,
      goodId: input.goodId,
      side: input.side,
      orderType: 'limit',
      price: left.price,
      quantity: input.quantity,
      remaining: left.remaining,
      escrowSilver: input.side === 'buy' ? left.price * left.remaining : 0,
      status: 'open',
      expiresAt: new Date(now.getTime() + ORDER_LIFE_MS),
    });
  }
  await audit(db, who, character.id, 'market.place', {
    orderId,
    fills: matched.fills.length,
    unfilled: matched.unfilled,
  });
  return { orderId, fills: matched.fills.length, unfilled: matched.unfilled };
}

async function expireOrder(db: Executor, orderId: string) {
  const [order] = await db
    .select()
    .from(marketOrders)
    .where(eq(marketOrders.id, orderId))
    .for('update');
  if (!order) return;
  if (order.status !== 'open') return;
  if (order.side === 'sell' && order.remaining > 0) {
    await changeStock(db, order.characterId, order.goodId, order.remaining);
  }
  if (order.side === 'buy' && order.escrowSilver > 0) {
    await credit(db, order.characterId, order.escrowSilver, `expire:${order.id}`, 'market.expire');
  }
  await db
    .update(marketOrders)
    .set({ status: 'expired', remaining: 0, escrowSilver: 0 })
    .where(eq(marketOrders.id, order.id));
}

export async function marketView(db: Executor, goodId: string, clock: Clock) {
  if (!tradableGood(goodId)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Tego nie ma na giełdzie');
  }
  const now = clock.now();
  await lockBook(db, goodId);
  const open = await loadOpen(db, goodId);
  await lockIds(
    db,
    open.map((order) => order.characterId),
  );
  for (const order of open) {
    if (order.expiresAt <= now) await expireOrder(db, order.id);
  }
  const live = await loadOpen(db, goodId);
  const trades = await db
    .select({ price: marketFills.price, quantity: marketFills.quantity, at: marketFills.createdAt })
    .from(marketFills)
    .where(eq(marketFills.goodId, goodId))
    .orderBy(desc(marketFills.createdAt))
    .limit(20);
  return {
    goodId,
    bids: live
      .filter((order) => order.side === 'buy')
      .map((order) => ({ price: order.price, remaining: order.remaining })),
    asks: live
      .filter((order) => order.side === 'sell')
      .map((order) => ({ price: order.price, remaining: order.remaining })),
    trades: trades.map((trade) => ({
      price: trade.price,
      quantity: trade.quantity,
      at: trade.at.toISOString(),
    })),
  };
}

async function holdItem(db: Executor, characterId: string, itemId: string, hold: string) {
  const [item] = await db
    .select()
    .from(itemInstances)
    .where(and(eq(itemInstances.id, itemId), eq(itemInstances.characterId, characterId)))
    .for('update');
  if (!item) throw new AppError(404, ERROR_CODES.notFound, 'Nie masz tego przedmiotu');
  if (item.hold || item.equippedSlot) {
    throw new AppError(409, ERROR_CODES.activityBusy, 'Przedmiot jest już związany');
  }
  await db.update(itemInstances).set({ hold }).where(eq(itemInstances.id, item.id));
  return item;
}

export async function listAuction(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  itemId: string,
  minBid: number,
  buyNow: number | null,
) {
  await lockCharacter(db, character.id);
  if (minBid < 1 || (buyNow !== null && buyNow < minBid)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Zła cena licytacji');
  }
  await holdItem(db, character.id, itemId, 'auction');
  const [row] = await db
    .insert(auctions)
    .values({ sellerId: character.id, itemId, minBid, buyNow, currentBid: 0 })
    .returning();
  await audit(db, who, character.id, 'auction.list', { itemId });
  return { auctionId: row?.id };
}

export async function bidAuction(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  auctionId: string,
  amount: number,
  buyNow: boolean,
) {
  const [auction] = await db
    .select()
    .from(auctions)
    .where(eq(auctions.id, auctionId))
    .for('update');
  if (!auction) throw new AppError(404, ERROR_CODES.notFound, 'Licytacja jest zamknięta');
  if (auction.status !== 'open') {
    throw new AppError(404, ERROR_CODES.notFound, 'Licytacja jest zamknięta');
  }
  const price = buyNow ? auction.buyNow : amount;
  if (price === null || price < auction.minBid || (!buyNow && price <= auction.currentBid)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Oferta jest za niska');
  }
  await lockIds(
    db,
    [character.id, auction.sellerId, auction.bidderId].filter((id): id is string => Boolean(id)),
  );
  if (auction.bidderId && auction.currentBid > 0) {
    await credit(
      db,
      auction.bidderId,
      auction.currentBid,
      `auction-refund:${auction.id}:${character.id}`,
      'auction.refund',
    );
  }
  await pay(db, character.id, price, `auction:${auction.id}:${character.id}`, 'auction.bid');
  if (buyNow || (auction.buyNow !== null && price >= auction.buyNow)) {
    await db
      .update(itemInstances)
      .set({ characterId: character.id, hold: null, equippedSlot: null })
      .where(eq(itemInstances.id, auction.itemId));
    await credit(db, auction.sellerId, price, `auction-pay:${auction.id}`, 'auction.sale');
    await db
      .update(auctions)
      .set({ status: 'sold', currentBid: price, bidderId: character.id })
      .where(eq(auctions.id, auction.id));
  } else {
    await db
      .update(auctions)
      .set({ currentBid: price, bidderId: character.id })
      .where(eq(auctions.id, auction.id));
  }
  await audit(db, who, character.id, 'auction.bid', { auctionId, price });
  return { price, sold: buyNow || (auction.buyNow !== null && price >= auction.buyNow) };
}

function canTrade(level: number, until: Date | null, now: Date): boolean {
  return level >= TRADE_MIN_LEVEL || patronActive(until?.getTime() ?? null, now.getTime());
}

async function saltLanternLodge(db: Executor): Promise<string | null> {
  const held = await db.select().from(lanternStates).where(eq(lanternStates.status, 'held'));
  const salt = held.find((row) => row.lodgeId !== null && lanternCity(row.sleeperId) === 'salt');
  return salt?.lodgeId ?? null;
}

export async function offerTrade(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  takerId: string,
  itemId: string,
  silver: number,
  now: Date,
) {
  if (!canTrade(character.level, character.patronUntil, now)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Handel bezpośredni od poziomu 10');
  }
  await lockCharacter(db, character.id);
  const [taker] = await db.select().from(characters).where(eq(characters.id, takerId)).limit(1);
  if (!taker) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma odbiorcy');
  await holdItem(db, character.id, itemId, 'trade');
  if (silver > 0) await pay(db, character.id, silver, `trade-escrow:${itemId}`, 'trade.escrow');
  const [row] = await db
    .insert(directTrades)
    .values({ makerId: character.id, takerId, itemId, silver, status: 'open' })
    .returning();
  await audit(db, who, character.id, 'trade.offer', { takerId, itemId });
  return { tradeId: row?.id };
}

export async function acceptTrade(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  tradeId: string,
  now: Date,
) {
  const [trade] = await db
    .select()
    .from(directTrades)
    .where(eq(directTrades.id, tradeId))
    .for('update');
  if (!trade) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej wymiany');
  if (trade.status !== 'open' || trade.takerId !== character.id) {
    throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej wymiany');
  }
  const [maker] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, trade.makerId))
    .limit(1);
  if (
    !maker ||
    !canTrade(character.level, character.patronUntil, now) ||
    !canTrade(maker.level, maker.patronUntil, now)
  ) {
    throw new AppError(409, ERROR_CODES.requirement, 'Handel bezpośredni od poziomu 10');
  }
  await lockIds(db, [character.id, trade.makerId]);
  if (trade.itemId) {
    await db
      .update(itemInstances)
      .set({ characterId: character.id, hold: null })
      .where(eq(itemInstances.id, trade.itemId));
  }
  if (trade.silver > 0) {
    await credit(db, character.id, trade.silver, `trade-pay:${trade.id}`, 'trade.pay');
  }
  await db.update(directTrades).set({ status: 'done' }).where(eq(directTrades.id, trade.id));
  await audit(db, who, character.id, 'trade.accept', { tradeId });
  return { tradeId };
}

export async function sendMail(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  toId: string,
  body: string,
  silver: number,
  goodId: string | null,
  goodQty: number,
  now: Date,
) {
  if (!canTrade(character.level, character.patronUntil, now)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Poczta z załącznikiem od poziomu 10');
  }
  await lockCharacter(db, character.id);
  if (silver > 0) await pay(db, character.id, silver, `mail:${randomUUID()}`, 'mail.escrow');
  if (goodId && goodQty > 0) {
    if (!tradableGood(goodId)) throw new AppError(409, ERROR_CODES.requirement, 'Tego nie wyślesz');
    await changeStock(db, character.id, goodId, -goodQty);
  }
  const [row] = await db
    .insert(mails)
    .values({ fromId: character.id, toId, body, silver, goodId, goodQty, claimed: false })
    .returning();
  await audit(db, who, character.id, 'mail.send', { toId });
  return { mailId: row?.id };
}

export async function claimMail(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  mailId: string,
) {
  const [mail] = await db.select().from(mails).where(eq(mails.id, mailId)).for('update');
  if (!mail) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma listu');
  if (mail.toId !== character.id) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma listu');
  if (mail.claimed) throw new AppError(409, ERROR_CODES.requirement, 'List już odebrany');
  await lockCharacter(db, character.id);
  if (mail.silver > 0)
    await credit(db, character.id, mail.silver, `mail-claim:${mail.id}`, 'mail.claim');
  if (mail.goodId && mail.goodQty > 0)
    await changeStock(db, character.id, mail.goodId, mail.goodQty);
  await db.update(mails).set({ claimed: true }).where(eq(mails.id, mail.id));
  await audit(db, who, character.id, 'mail.claim', { mailId });
  return { mailId };
}

export async function upgradeWorkshop(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  station: string,
) {
  await lockCharacter(db, character.id);
  const [row] = await db
    .select()
    .from(workshopStates)
    .where(eq(workshopStates.characterId, character.id))
    .for('update');
  if (!row) throw new Error('Brak warsztatu');
  const level = row.levels[station] ?? 0;
  if (level >= WORKSHOP_MAX_LEVEL) {
    throw new AppError(409, ERROR_CODES.requirement, 'Warsztat jest na szczycie');
  }
  await pay(
    db,
    character.id,
    workshopUpgradeCost(level + 1),
    `workshop:${station}:${level + 1}`,
    'workshop.upgrade',
  );
  await db
    .update(workshopStates)
    .set({ levels: { ...row.levels, [station]: level + 1 } })
    .where(eq(workshopStates.characterId, character.id));
  await audit(db, who, character.id, 'workshop.upgrade', { station, level: level + 1 });
  return { station, level: level + 1 };
}

export async function claimCandle(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  await lockCharacter(db, character.id);
  const [row] = await db
    .select()
    .from(workshopStates)
    .where(eq(workshopStates.characterId, character.id))
    .for('update');
  if (!row) throw new Error('Brak warsztatu');
  if ((row.levels.candles ?? 0) < CANDLE_LEVEL) {
    throw new AppError(
      409,
      ERROR_CODES.requirement,
      'Odlewnia Świec od poziomu 5 daje Świecę Progu',
    );
  }
  const now = clock.now();
  if (row.candleAt && now.getTime() < row.candleAt.getTime() + CANDLE_INTERVAL_MS) {
    throw new AppError(409, ERROR_CODES.activityNotReady, 'Wosk jeszcze zastyga');
  }
  await grantKeyShards(db, character.id, 1, now);
  await db
    .update(workshopStates)
    .set({ candleAt: now })
    .where(eq(workshopStates.characterId, character.id));
  await audit(db, who, character.id, 'workshop.candle', {});
  return { shards: 1 };
}

const JOBS: Record<string, { input: string; output: string; ms: number }> = {
  forge: { input: 'fish:Śledź', output: 'ration:konserwa', ms: 20 * MINUTE_MS },
  distillery: { input: 'crop:wormwood', output: 'ration:laudanum', ms: 30 * MINUTE_MS },
  taxidermy: { input: 'fillet:filet', output: 'ration:eksponat', ms: 15 * MINUTE_MS },
};

export async function startJob(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  station: string,
  tomeId: string | null,
) {
  await lockCharacter(db, character.id);
  const [row] = await db
    .select()
    .from(workshopStates)
    .where(eq(workshopStates.characterId, character.id))
    .for('update');
  if (!row) throw new Error('Brak warsztatu');
  if ((row.levels[station] ?? 0) < 1) {
    throw new AppError(409, ERROR_CODES.requirement, 'Najpierw podnieś warsztat');
  }
  if (row.jobs.some((job) => job.station === station)) {
    throw new AppError(409, ERROR_CODES.activityBusy, 'Ta stacja już pracuje');
  }
  const now = clock.now();
  let output: string;
  let ms: number;
  if (station === 'bindery') {
    if (!tomeId) throw new AppError(409, ERROR_CODES.requirement, 'Podaj tom');
    const lore = await loadLore(db, character.id);
    if (!lore.booksRead.includes(tomeId)) {
      throw new AppError(409, ERROR_CODES.requirement, 'Najpierw przeczytaj tom');
    }
    await pay(db, character.id, 20, `copy:${tomeId}:${now.toISOString()}`, 'workshop.copy');
    output = `book:${tomeId}`;
    ms = HOUR_MS;
  } else {
    const recipe = JOBS[station];
    if (!recipe) throw new AppError(404, ERROR_CODES.notFound, 'Ta stacja nie przyjmuje zleceń');
    await changeStock(db, character.id, recipe.input, -1);
    output = recipe.output;
    ms = recipe.ms;
  }
  const jobs = [
    ...row.jobs,
    { station, goodId: output, endsAt: new Date(now.getTime() + ms).toISOString() },
  ];
  await db.update(workshopStates).set({ jobs }).where(eq(workshopStates.characterId, character.id));
  await audit(db, who, character.id, 'workshop.start', { station, output });
  return { station, endsAt: jobs[jobs.length - 1]?.endsAt };
}

export async function claimJobs(db: Executor, character: CharacterRow, clock: Clock) {
  const now = clock.now();
  const [row] = await db
    .select()
    .from(workshopStates)
    .where(eq(workshopStates.characterId, character.id))
    .for('update');
  if (!row) return [];
  const done = row.jobs.filter((job) => Date.parse(job.endsAt) <= now.getTime());
  if (done.length === 0) return row.jobs;
  for (const job of done) await changeStock(db, character.id, job.goodId, 1);
  const jobs = row.jobs.filter((job) => Date.parse(job.endsAt) > now.getTime());
  await db.update(workshopStates).set({ jobs }).where(eq(workshopStates.characterId, character.id));
  return jobs;
}

export async function portOf(db: Executor, character: CharacterRow, clock: Clock) {
  const jobs = await claimJobs(db, character, clock);
  const [market] = await db
    .select()
    .from(marketStates)
    .where(eq(marketStates.characterId, character.id))
    .limit(1);
  const [workshop] = await db
    .select()
    .from(workshopStates)
    .where(eq(workshopStates.characterId, character.id))
    .limit(1);
  const inbox = await db
    .select()
    .from(mails)
    .where(and(eq(mails.toId, character.id), eq(mails.claimed, false)));
  return {
    goods: market?.goods ?? {},
    levels: workshop?.levels ?? {},
    jobs,
    candleReady:
      (workshop?.levels.candles ?? 0) >= CANDLE_LEVEL &&
      (!workshop?.candleAt ||
        clock.now().getTime() >= workshop.candleAt.getTime() + CANDLE_INTERVAL_MS),
    mail: inbox.length,
  };
}

export async function postChat(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  channel: string,
  body: string,
) {
  if (!['general', 'trade', 'help'].includes(channel)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Nie ma takiego kanału');
  }
  const [row] = await db
    .insert(chatMessages)
    .values({ channel, characterId: character.id, body })
    .returning();
  await audit(db, who, character.id, 'chat.post', { channel });
  return { id: row?.id };
}

export async function readChat(db: Executor, character: CharacterRow, channel: string) {
  const blocked = await db
    .select({ id: chatBlocks.blockedId })
    .from(chatBlocks)
    .where(eq(chatBlocks.characterId, character.id));
  const hiddenIds = new Set(blocked.map((row) => row.id));
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.channel, channel), eq(chatMessages.hidden, false)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(50);
  return rows
    .filter((row) => !hiddenIds.has(row.characterId))
    .reverse()
    .map((row) => ({ id: row.id, body: row.body, at: row.createdAt.toISOString() }));
}

export async function reportChat(db: Executor, character: CharacterRow, messageId: string) {
  await db
    .insert(chatReports)
    .values({ messageId, reporterId: character.id })
    .onConflictDoNothing();
  const reports = await db
    .select({ id: chatReports.id })
    .from(chatReports)
    .where(eq(chatReports.messageId, messageId));
  if (reports.length >= 3) {
    await db.update(chatMessages).set({ hidden: true }).where(eq(chatMessages.id, messageId));
  }
  return { reports: reports.length };
}

export async function blockChatter(db: Executor, character: CharacterRow, blockedId: string) {
  await db
    .insert(chatBlocks)
    .values({ characterId: character.id, blockedId })
    .onConflictDoNothing();
  return { blockedId };
}

export async function addFriend(db: Executor, character: CharacterRow, friendId: string) {
  await db
    .insert(friendships)
    .values({ characterId: character.id, friendId })
    .onConflictDoNothing();
  return { friendId };
}

export async function filletFish(db: Executor, character: CharacterRow) {
  await lockCharacter(db, character.id);
  const world = await loadWorld(db, character.id, true);
  const fish = world.basket[world.basket.length - 1];
  if (!fish) throw new AppError(409, ERROR_CODES.requirement, 'Kosz jest pusty');
  await saveWorld(db, { ...world, basket: world.basket.slice(0, -1) });
  await changeStock(db, character.id, 'fillet:filet', 1);
  return { goodId: 'fillet:filet' };
}

export async function eatRation(
  db: Executor,
  character: CharacterRow,
  clock: Clock,
  goodId: string,
) {
  if (goodId !== 'fillet:filet' && goodId !== 'ration:laudanum') {
    throw new AppError(409, ERROR_CODES.requirement, 'Tego się nie je');
  }
  await lockCharacter(db, character.id);
  await changeStock(db, character.id, goodId, -1);
  const now = clock.now();
  const lore = await loadLore(db, character.id);
  const ctx = resourceContext(character.level, lore.knowledge, 0);
  const resources = materializeAll(
    await loadResources(db, character.id, { forUpdate: true }),
    ctx,
    now,
  );
  const max = resourceMax('life', ctx);
  const gained = adjustResource('life', resources.life, now.getTime(), max, 5);
  const life = gained.value > max ? { value: max, updatedAt: now.getTime() } : gained;
  await saveResources(db, character.id, { ...resources, life });
  return { life: life.value };
}

export async function packCrate(
  db: Executor,
  character: CharacterRow,
  goodId: string,
  qty: number,
) {
  if (!tradableGood(goodId) || qty < 1) {
    throw new AppError(409, ERROR_CODES.requirement, 'Tego nie zapakujesz');
  }
  await lockCharacter(db, character.id);
  const world = await loadWorld(db, character.id, true);
  const mount =
    world.mountId && world.mountUntil && world.mountUntil > new Date() ? world.mountId : null;
  const slots = CRATE_BASE_SLOTS + (mount && mount in MOUNTS ? MOUNTS[mount as MountId].slots : 0);
  const used = world.crate.reduce((sum, stack) => sum + stack.qty, 0);
  if (used + qty > slots) throw new AppError(409, ERROR_CODES.requirement, 'Skrzynia jest pełna');
  await changeStock(db, character.id, goodId, -qty);
  const existing = world.crate.find((stack) => stack.goodId === goodId);
  const crate = existing
    ? world.crate.map((stack) =>
        stack.goodId === goodId ? { ...stack, qty: stack.qty + qty } : stack,
      )
    : [...world.crate, { goodId, qty }];
  await saveWorld(db, { ...world, crate });
  return { slots, used: used + qty };
}

export async function sellCrate(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  await lockCharacter(db, character.id);
  const world = await loadWorld(db, character.id, true);
  let silver = 0;
  for (const stack of world.crate) {
    const price = smugglePrice(world.city, stack.goodId);
    if (price) silver += price * stack.qty;
  }
  if (silver > 0) {
    await credit(
      db,
      character.id,
      silver,
      `smuggle:${character.id}:${clock.now().toISOString()}`,
      'smuggle.sell',
    );
  }
  await saveWorld(db, { ...world, crate: [] });
  await audit(db, who, character.id, 'smuggle.sell', { silver });
  return { silver };
}

export async function findCharacterId(db: Executor, name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(sql`lower(${characters.name}) = lower(${name})`)
    .limit(1);
  return row?.id ?? null;
}
