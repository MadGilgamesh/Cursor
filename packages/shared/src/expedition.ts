/**
 * Wyprawy 1–4 i eskorty (GDD 5.11, 5.23, rozdz. 11 — Etap 8).
 * GDD nie podaje tabeli utraty łupu ani ceny wejścia. Liczby poniżej są założeniem
 * i test akceptacyjny sprawdza właśnie je.
 */
import type { ClassId } from './balance.js';
import { HOUR_MS } from './balance.js';
import { awakeningWeekStart } from './lodge.js';
import type { Rng } from './rng.js';
import { isWolfHour, tideAt } from './world.js';

export const EXPEDITION_IDS = ['canals', 'wreck', 'archive', 'crypts'] as const;
export type ExpeditionId = (typeof EXPEDITION_IDS)[number];

export const EXPEDITION_WINDOWS = ['always', 'tide', 'night', 'weekend'] as const;
export type ExpeditionWindow = (typeof EXPEDITION_WINDOWS)[number];

export interface ExpeditionDef {
  id: ExpeditionId;
  name: string;
  level: number;
  party: number;
  hours: number;
  window: ExpeditionWindow;
  weekly: number;
}

/** Ys-Kahal i Oko Czerni są w Etapie 10. */
export const EXPEDITIONS: readonly ExpeditionDef[] = [
  {
    id: 'canals',
    name: 'Kanały pod Solą',
    level: 12,
    party: 3,
    hours: 1,
    window: 'always',
    weekly: 5,
  },
  {
    id: 'wreck',
    name: 'Wrak „Miłosierdzia”',
    level: 20,
    party: 4,
    hours: 2,
    window: 'tide',
    weekly: 4,
  },
  {
    id: 'archive',
    name: 'Archiwum pod Ilmarem',
    level: 30,
    party: 4,
    hours: 3,
    window: 'night',
    weekly: 3,
  },
  {
    id: 'crypts',
    name: 'Lodowe Krypty Kresu',
    level: 40,
    party: 5,
    hours: 4,
    window: 'weekend',
    weekly: 3,
  },
];

export function findExpedition(id: string): ExpeditionDef | undefined {
  return EXPEDITIONS.find((entry) => entry.id === id);
}

export const expeditionDurationMs = (def: ExpeditionDef) => def.hours * HOUR_MS;

/**
 * Cztery przeszkody na każdą wyprawę (GDD: 4–6). Kanały mają drużynę 3,
 * więc zawsze brakuje co najmniej jednej klasy — tabela utraty jest wtedy widoczna.
 */
export const EXPEDITION_OBSTACLES: readonly { classId: ClassId; name: string }[] = [
  { classId: 'butcher', name: 'Wyważenie wrót' },
  { classId: 'marksman', name: 'Strzał w sklepienie' },
  { classId: 'occultist', name: 'Odczyt pieczęci' },
  { classId: 'alienist', name: 'Uspokojenie' },
];

/** Założenie: 15% puli bazowej za każdą pominiętą przeszkodę. */
export const OBSTACLE_LOOT_LOSS_BP = 1_500;
/** Założenie: −5 wspólnej Poczytalności za każdą pominiętą przeszkodę. */
export const OBSTACLE_SANITY_LOSS = 5;
/** Pula poniżej 25% maksimum to Zdrada. */
export const BETRAYAL_THRESHOLD_BP = 2_500;
/** Założenie: Zdrada zostawia 80% łupu po przeszkodach. */
export const BETRAYAL_LOOT_LOSS_BP = 2_000;
/** Założenie: Alienista leczy +8 wspólnej puli, nie powyżej średniej maksimów. */
export const ALIENIST_HEAL = 8;
/** Założenie: asysta daje +10 reputacji Zakonu i nic więcej. */
export const ASSIST_ORDER_REPUTATION = 10;
/** Założenie: wejście kosztuje `poziom × 50` srebra od każdego, kto nie jest asystą. */
export const ENTRY_SILVER_PER_LEVEL = 50;
/** Założenie: pula bazowa to `100 × poziom wyprawy × liczebność drużyny`. */
export const POOL_PER_LEVEL = 100;
/** Założenie: osobisty łup to 1 Pieczęć Zakonu i 1 Odłamek Klucza. */
export const PERSONAL_SEALS = 1;
export const PERSONAL_SHARDS = 1;
/** Założenie: eskortujący dostaje 1 Pieczęć Straży za przejętą walkę. */
export const ESCORT_GUARD_SEAL = 1;
/** Założenie: doświadczenie z udziału to jedna dziesiąta przyznanego srebra. */
export const SHARE_XP_DIVISOR = 10;

export const shareExperience = (share: number) => Math.floor(Math.max(0, share) / SHARE_XP_DIVISOR);
/** −30% straty Poczytalności z pierwszego zdarzenia eskorty (GDD 5.23). */
export const ESCORT_SANITY_KEEP_BP = 7_000;

export const expeditionWeek = (now: number) => awakeningWeekStart(now);

export function entrySilver(level: number): number {
  return Math.max(0, level) * ENTRY_SILVER_PER_LEVEL;
}

export function basePool(level: number, party: number): number {
  return POOL_PER_LEVEL * level * party;
}

/** Obecność klasy, nie liczba członków: dwóch Rzeźników nie wyważa dwojga wrót. */
export function missedObstacles(classes: readonly (ClassId | null)[]): readonly {
  classId: ClassId;
  name: string;
}[] {
  const present = new Set(classes.filter((classId): classId is ClassId => classId !== null));
  return EXPEDITION_OBSTACLES.filter((obstacle) => !present.has(obstacle.classId));
}

export function lootAfterObstacles(pool: number, missed: number): number {
  const loss = Math.floor((pool * missed * OBSTACLE_LOOT_LOSS_BP) / 10_000);
  return Math.max(0, pool - loss);
}

export function sharedSanity(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.floor(sum / values.length);
}

export function betrayalRisk(shared: number, max: number): boolean {
  if (max <= 0) return false;
  return shared * 10_000 < max * BETRAYAL_THRESHOLD_BP;
}

export function betrayalLoot(loot: number): number {
  return Math.floor((loot * (10_000 - BETRAYAL_LOOT_LOSS_BP)) / 10_000);
}

/**
 * Okno z GDD. Założenia Etapu 8: przypływ = wysoki pływ, noc = Godzina Wilka,
 * pt–nd = piątek, sobota i niedziela UTC.
 */
export function expeditionOpen(window: ExpeditionWindow, now: number): boolean {
  if (window === 'always') return true;
  if (window === 'tide') return tideAt(now) === 'high';
  if (window === 'night') return isWolfHour(now);
  const day = new Date(now).getUTCDay();
  return day === 5 || day === 6 || day === 0;
}

export function halvedByEscort(chance: number, active: boolean): number {
  return active ? Math.floor(chance / 2) : chance;
}

export function escortSanityLoss(loss: number, firstEvent: boolean): number {
  if (!firstEvent) return loss;
  return Math.round((loss * ESCORT_SANITY_KEEP_BP) / 10_000);
}

export interface ExpeditionMemberSnap {
  characterId: string;
  name: string;
  classId: ClassId | null;
  assist: boolean;
  sanity: number;
  maxSanity: number;
}

export interface ExpeditionResolution {
  pool: number;
  loot: number;
  shared: number;
  sharedMax: number;
  missed: number;
  betrayerId: string | null;
  log: string[];
}

export function resolveExpedition(
  def: ExpeditionDef,
  members: readonly ExpeditionMemberSnap[],
  rng: Rng,
): ExpeditionResolution {
  const missed = missedObstacles(members.map((member) => member.classId));
  const pool = basePool(def.level, def.party);
  let loot = lootAfterObstacles(pool, missed.length);
  const sharedMax = sharedSanity(members.map((member) => member.maxSanity));
  let shared = sharedSanity(members.map((member) => member.sanity));
  const log = missed.map((obstacle) => `Brakuje klasy przy: ${obstacle.name}.`);
  const healed = members.some((member) => member.classId === 'alienist');
  if (healed) {
    shared = Math.min(sharedMax, shared + ALIENIST_HEAL);
    log.push('Alienista koi umysł drużyny.');
  }
  shared = Math.max(0, shared - missed.length * OBSTACLE_SANITY_LOSS);
  let betrayerId: string | null = null;
  if (betrayalRisk(shared, sharedMax) && members.length > 0) {
    const index = rng.nextInt(0, members.length - 1);
    const betrayer = members[index];
    if (betrayer) {
      betrayerId = betrayer.characterId;
      loot = betrayalLoot(loot);
      log.push(`${betrayer.name} słyszy Śpiącego.`);
    }
  }
  return { pool, loot, shared, sharedMax, missed: missed.length, betrayerId, log };
}
