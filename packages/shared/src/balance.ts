/**
 * Plik balansu (GDD rozdz. 10). Wszystkie liczby etapu są tutaj, a każda zmiana
 * wymaga podniesienia `BALANCE_VERSION` — wyniki zapisują wersję, więc hotfix
 * balansu nie zmienia historii (GDD 9.2).
 *
 * Funkcje są czyste i liczą wyłącznie na liczbach całkowitych lub operacjach
 * dokładnie zaokrąglanych w IEEE 754 (mnożenie, `Math.sqrt`), dzięki czemu klient
 * i serwer zawsze dają ten sam wynik.
 */
import { applyBp } from './fixed-point.js';

export const BALANCE_VERSION = 1;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

export const RESOURCE_KINDS = ['life', 'vigor', 'toil', 'sanity'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** Parametry zasobów z GDD 4.2 i 10.1 (bez Patronatu — decyzja otwarta w GDD 12.2). */
export const RESOURCE_RULES = {
  /** Życie: max `100 + 20·(L−1)`; regeneracja 5% max co 10 min. */
  life: { baseMax: 100, maxPerLevel: 20, regenBpOfMax: 500, regenIntervalMs: 10 * MINUTE_MS },
  /** Wigor: max 100; +5 co 10 min (pełny w 3 h 20 min). */
  vigor: { baseMax: 100, regenAmount: 5, regenIntervalMs: 10 * MINUTE_MS },
  /** Znój: max 50; +1 co 6 min (pełny w 5 h). */
  toil: { baseMax: 50, regenAmount: 1, regenIntervalMs: 6 * MINUTE_MS },
  /** Poczytalność: max `100 − 0,75·Wiedza`; +3 co godzinę. */
  sanity: { baseMax: 100, knowledgePenaltyBp: 7_500, regenAmount: 3, regenIntervalMs: HOUR_MS },
} as const;

export interface ResourceContext {
  level: number;
  /** Wiedza Zakazana 0–80 (GDD 6.2); do czasu Etapu 3 zawsze 0. */
  knowledge: number;
}

export function resourceMax(kind: ResourceKind, ctx: ResourceContext): number {
  switch (kind) {
    case 'life':
      return RESOURCE_RULES.life.baseMax + RESOURCE_RULES.life.maxPerLevel * (ctx.level - 1);
    case 'vigor':
      return RESOURCE_RULES.vigor.baseMax;
    case 'toil':
      return RESOURCE_RULES.toil.baseMax;
    case 'sanity':
      return (
        RESOURCE_RULES.sanity.baseMax -
        applyBp(ctx.knowledge, RESOURCE_RULES.sanity.knowledgePenaltyBp)
      );
  }
}

/** Przyrost na jeden „tik” regeneracji i długość tiku. */
export function regenRule(kind: ResourceKind, max: number): { amount: number; intervalMs: number } {
  if (kind === 'life') {
    const rule = RESOURCE_RULES.life;
    return {
      amount: Math.max(1, applyBp(max, rule.regenBpOfMax)),
      intervalMs: rule.regenIntervalMs,
    };
  }
  const rule = RESOURCE_RULES[kind];
  return { amount: rule.regenAmount, intervalMs: rule.regenIntervalMs };
}

/** Stan zasobu w bazie: wartość w chwili `updatedAt` (ms od epoki, czas serwera). */
export interface StoredResource {
  value: number;
  updatedAt: number;
}

/**
 * Leniwa regeneracja (GDD 8.2 `ResourceState`): wylicza wartość na chwilę `now`.
 * Niepełny tik nie przepada — `updatedAt` przesuwa się tylko o pełne tiki.
 * Zasób pełny (lub ponad limitem z nagród) nie regeneruje się, a jego zegar
 * startuje dopiero od chwili wydania.
 */
export function materializeResource(
  kind: ResourceKind,
  stored: StoredResource,
  now: number,
  max: number,
): StoredResource {
  if (now <= stored.updatedAt) return stored;
  if (stored.value >= max) return { value: stored.value, updatedAt: now };
  const { amount, intervalMs } = regenRule(kind, max);
  const ticks = Math.floor((now - stored.updatedAt) / intervalMs);
  const value = Math.min(max, stored.value + ticks * amount);
  if (value >= max) return { value, updatedAt: now };
  return { value, updatedAt: stored.updatedAt + ticks * intervalMs };
}

/** Kiedy nastąpi następny tik i kiedy zasób będzie pełny (`null`, gdy już jest). */
export function resourceTimers(
  kind: ResourceKind,
  stored: StoredResource,
  max: number,
): { nextTickAt: number | null; fullAt: number | null } {
  if (stored.value >= max) return { nextTickAt: null, fullAt: null };
  const { amount, intervalMs } = regenRule(kind, max);
  const ticksNeeded = Math.ceil((max - stored.value) / amount);
  return {
    nextTickAt: stored.updatedAt + intervalMs,
    fullAt: stored.updatedAt + ticksNeeded * intervalMs,
  };
}

/** Wydaje zasób po uprzedniej regeneracji; `null`, gdy go nie starcza. */
export function spendResource(
  kind: ResourceKind,
  stored: StoredResource,
  now: number,
  max: number,
  cost: number,
): StoredResource | null {
  if (!Number.isSafeInteger(cost) || cost < 0) throw new RangeError(`Niepoprawny koszt: ${cost}`);
  const current = materializeResource(kind, stored, now, max);
  if (current.value < cost) return null;
  return { value: current.value - cost, updatedAt: current.updatedAt };
}

/** Czasy i koszty Zleceń w Wigorze (GDD 10.1): 5 min / 15 min / 1 h / 4 h / 8 h. */
export const MISSION_TIERS = [
  { id: 'm5', durationMs: 5 * MINUTE_MS, vigorCost: 5 },
  { id: 'm15', durationMs: 15 * MINUTE_MS, vigorCost: 10 },
  { id: 'h1', durationMs: HOUR_MS, vigorCost: 20 },
  { id: 'h4', durationMs: 4 * HOUR_MS, vigorCost: 35 },
  { id: 'h8', durationMs: 8 * HOUR_MS, vigorCost: 50 },
] as const;
export type MissionTierId = (typeof MISSION_TIERS)[number]['id'];

export function missionTier(id: MissionTierId) {
  const tier = MISSION_TIERS.find((candidate) => candidate.id === id);
  if (!tier) throw new RangeError(`Nieznany czas zlecenia: ${id}`);
  return tier;
}

/** `L^1,25` jako `L·√√L` — deterministycznie w każdym silniku JS. */
const pow125 = (level: number) => level * Math.sqrt(Math.sqrt(level));

/** XP za zlecenie (GDD 10.2): `W · (2·L + 4) · 1,2 · (1 + 0,4·P)`. */
export function missionExperience(vigorCost: number, level: number, deepening = 0): number {
  return Math.round((vigorCost * (2 * level + 4) * 12 * (10 + 4 * deepening)) / 100);
}

/** Srebro za zlecenie (GDD 10.5): `W · 0,5 · L^1,25 · (1 + 0,4·P)`. */
export function missionSilver(vigorCost: number, level: number, deepening = 0): number {
  return Math.round((vigorCost * pow125(level) * (10 + 4 * deepening)) / 20);
}
