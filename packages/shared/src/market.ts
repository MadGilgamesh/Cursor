/**
 * Giełda, handel i warsztaty (GDD 5.7, 5.15).
 * Dopasowanie jest czystą funkcją: ta sama księga i to samo zlecenie dają te same transakcje.
 */
import { DAY_MS } from './balance.js';
import { CROPS } from './garden.js';
import { TOMES } from './lore.js';
import { PORTAL_DOMAINS } from './data/portal.js';
import { FISHERIES } from './fishing.js';

export const LISTING_FEE_BP = 100;
export const SELLER_FEE_BP = 300;
export const ORDER_LIFE_MS = 7 * DAY_MS;
export const TRADE_MIN_LEVEL = 10;
export const CANDLE_LEVEL = 5;
export const CANDLE_INTERVAL_MS = DAY_MS;
export const WORKSHOP_MAX_LEVEL = 10;
export const CRATE_BASE_SLOTS = 2;

export const listingFee = (notional: number) => Math.floor((notional * LISTING_FEE_BP) / 10_000);
export const sellerFee = (notional: number) => Math.floor((notional * SELLER_FEE_BP) / 10_000);

export const WORKSHOP_STATIONS = [
  'forge',
  'distillery',
  'bindery',
  'taxidermy',
  'candles',
] as const;
export type WorkshopStation = (typeof WORKSHOP_STATIONS)[number];

/** Koszt podniesienia warsztatu o 1. Założenie: 100 srebra × nowy poziom. */
export const workshopUpgradeCost = (nextLevel: number) => 100 * nextLevel;

const MATERIALS = new Set(PORTAL_DOMAINS.map((domain) => domain.materialId));
const CROPS_IDS = new Set(CROPS.map((crop) => crop.id));
const TOME_IDS = new Set(TOMES.map((tome) => tome.id));
const FISH = new Set(FISHERIES.flatMap((fishery) => [...fishery.fish]));

/** Towary stakowalne. Klucze i Sigile nie mają tu miejsca. */
export function tradableGood(id: string): boolean {
  const split = id.indexOf(':');
  if (split <= 0) return false;
  const kind = id.slice(0, split);
  const name = id.slice(split + 1);
  if (kind === 'crop') return CROPS_IDS.has(name);
  if (kind === 'fish') return FISH.has(name);
  if (kind === 'material') return MATERIALS.has(name);
  if (kind === 'book') return TOME_IDS.has(name);
  if (kind === 'fillet') return name === 'filet';
  if (kind === 'ration') return name === 'konserwa' || name === 'laudanum' || name === 'eksponat';
  if (kind === 'seal') return name === 'patron';
  return false;
}

export interface RestingOrder {
  id: string;
  characterId: string;
  side: 'buy' | 'sell';
  price: number;
  remaining: number;
  createdAt: number;
}

export interface IncomingOrder {
  id: string;
  characterId: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price: number | null;
  quantity: number;
  createdAt: number;
}

export interface MarketFill {
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  sellerId: string;
  price: number;
  quantity: number;
}

/**
 * Cena transakcji to cena zlecenia leżącego w księdze.
 * Zlecenie market nie zostaje w księdze. Zlecenie limit zostawia resztę.
 * Postać nie handluje sama ze sobą.
 */
export function matchOrder(
  resting: readonly RestingOrder[],
  incoming: IncomingOrder,
): { resting: RestingOrder[]; fills: MarketFill[]; unfilled: number } {
  const book = resting.filter((order) => order.remaining > 0).map((order) => ({ ...order }));
  const fills: MarketFill[] = [];
  let qty = incoming.quantity;
  const opponents = book
    .filter((order) => order.side !== incoming.side && order.characterId !== incoming.characterId)
    .filter((order) => {
      if (incoming.type === 'market') return true;
      const limit = incoming.price ?? 0;
      return incoming.side === 'buy' ? order.price <= limit : order.price >= limit;
    })
    .sort((a, b) => {
      if (a.price !== b.price) {
        return incoming.side === 'buy' ? a.price - b.price : b.price - a.price;
      }
      return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
    });
  for (const order of opponents) {
    if (qty <= 0) break;
    const take = Math.min(qty, order.remaining);
    order.remaining -= take;
    qty -= take;
    fills.push({
      buyOrderId: incoming.side === 'buy' ? incoming.id : order.id,
      sellOrderId: incoming.side === 'sell' ? incoming.id : order.id,
      buyerId: incoming.side === 'buy' ? incoming.characterId : order.characterId,
      sellerId: incoming.side === 'sell' ? incoming.characterId : order.characterId,
      price: order.price,
      quantity: take,
    });
  }
  if (incoming.type === 'limit' && qty > 0 && incoming.price !== null) {
    book.push({
      id: incoming.id,
      characterId: incoming.characterId,
      side: incoming.side,
      price: incoming.price,
      remaining: qty,
      createdAt: incoming.createdAt,
    });
    qty = 0;
  }
  return { resting: book.filter((order) => order.remaining > 0), fills, unfilled: qty };
}

/** Ceny Kupca Towarów. Założenie: konserwa drożeje im dalej od portu. */
export const SMUGGLE_PRICES: Record<string, Record<string, number>> = {
  salt: { 'ration:konserwa': 8, 'fillet:filet': 4, 'ration:laudanum': 12 },
  ilmar: { 'ration:konserwa': 14, 'fillet:filet': 6, 'ration:laudanum': 18 },
  mire: { 'ration:konserwa': 11, 'fillet:filet': 9, 'ration:laudanum': 10 },
  brink: { 'ration:konserwa': 16, 'fillet:filet': 5, 'ration:laudanum': 22 },
};

export function smugglePrice(city: string, goodId: string): number | null {
  return SMUGGLE_PRICES[city]?.[goodId] ?? null;
}
