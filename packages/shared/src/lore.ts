/**
 * Wiedza, Blizny, Kolegium, Konstelacja, frakcje, Bestiariusz, Kaplica,
 * Przekucie i kamienie Kalendarza (GDD 5.17, 5.18, 6.1, 6.2, 6.9, 5.12.5).
 * Liczby tego etapu. Zmiana wymaga podniesienia `BALANCE_VERSION`.
 */
import { HOUR_MS } from './balance.js';
import type { SanityTier } from './balance.js';

export const KNOWLEDGE_MAX = 80;
export const KNOWLEDGE_REFORGE_FREE = 20;
export const SCAR_CAP = 3;
export const SCAR_CHANCE_BP = 2_500;
export const VOICE_SCAR_SANITY_PENALTY = 5;

export const MIND_SCARS = [
  { id: 'thalassophobia', name: 'Talasofobia' },
  { id: 'counting', name: 'Mania Liczenia' },
  { id: 'voice', name: 'Głos w Ścianach' },
  { id: 'nyctophilia', name: 'Nyktofilia' },
  { id: 'hematophobia', name: 'Hematofobia' },
  { id: 'empty-eyes', name: 'Pustka w Oczach' },
] as const;
export type MindScarId = (typeof MIND_SCARS)[number]['id'];

export const COUNTING_CHANCE_BONUS_BP = 500;
export const COUNTING_DURATION_BONUS_BP = 1_000;
export const EDGE_LOOT_BONUS_BP = 2_500;

export function edgeLootMultiplier(tier: SanityTier): number {
  return tier === 'edge' ? 1 + EDGE_LOOT_BONUS_BP / 10_000 : 1;
}

/** +Wgląd z progu Poczytalności (GDD 6.1), w punktach bazowych. */
export function sanityInsightBonusBp(tier: SanityTier): number {
  if (tier === 'uneasy') return 1_000;
  if (tier === 'shaken') return 2_500;
  if (tier === 'edge') return 5_000;
  return 0;
}

export function rollMindScar(
  hit: boolean,
  existing: readonly string[],
  rolledId: string,
): string | null {
  if (!hit || existing.length >= SCAR_CAP || existing.includes(rolledId)) return null;
  return MIND_SCARS.some((scar) => scar.id === rolledId) ? rolledId : null;
}

export function sanityPenaltyForScars(scars: readonly string[]): number {
  return scars.includes('voice') ? VOICE_SCAR_SANITY_PENALTY : 0;
}

export const panicImmune = (scars: readonly string[]) => scars.includes('empty-eyes');

/** Przekucie: 3 Klucze + 1 Ichor, maks. 5 dziennie; od Wiedzy 20 bez Ichoru. */
export const REFORGE_DAILY_CAP = 5;
export const REFORGE_KEYS = 3;
export const REFORGE_ICHOR = 1;
export const SIGIL_SHARDS_PER_SIGIL = 10;

export function reforgeIchorCost(knowledge: number): number {
  return knowledge >= KNOWLEDGE_REFORGE_FREE ? 0 : REFORGE_ICHOR;
}

export function addSigilShards(
  shards: number,
  sigils: Readonly<Record<string, number>>,
  domain: number,
  gained: number,
): { shards: number; sigils: Record<string, number> } {
  const total = shards + gained;
  const made = Math.floor(total / SIGIL_SHARDS_PER_SIGIL);
  const key = String(domain);
  return {
    shards: total % SIGIL_SHARDS_PER_SIGIL,
    sigils: { ...sigils, [key]: (sigils[key] ?? 0) + made },
  };
}

export const BESTIARY_PAGE_KILLS = [10, 50, 200, 1_000] as const;

export function bestiaryPages(kills: number): number {
  return BESTIARY_PAGE_KILLS.filter((need) => kills >= need).length;
}

/** Czwarta strona typu z Domeny daje Sigil raz, przy 1000. zabiciu. */
export function bestiarySigilUnlock(before: number, after: number): boolean {
  return before < 1_000 && after >= 1_000;
}

export const DOMAIN_BOOK_KNOWLEDGE = (domain: number) => 3 * (domain - 1);

export interface TomeDef {
  id: string;
  name: string;
  hours: number;
  knowledge: number;
  /** Utrata Poczytalności za każdą ćwiartkę lektury. */
  sanityPerQuarter: number;
  domain: number | null;
  extinct: boolean;
}

export const TOMES: readonly TomeDef[] = [
  {
    id: 'tome.salt-psalter',
    name: 'Psałterz Soli',
    hours: 2,
    knowledge: 2,
    sanityPerQuarter: 2,
    domain: null,
    extinct: false,
  },
  {
    id: 'tome.ib',
    name: 'Pieśni z Ib',
    hours: 4,
    knowledge: 1,
    sanityPerQuarter: 3,
    domain: 1,
    extinct: false,
  },
  {
    id: 'tome.yha',
    name: "Pieśni z Y'ha-nthlei",
    hours: 4,
    knowledge: 1,
    sanityPerQuarter: 3,
    domain: 2,
    extinct: false,
  },
  {
    id: 'tome.colour',
    name: 'Popiół bez Nazwy',
    hours: 4,
    knowledge: 1,
    sanityPerQuarter: 4,
    domain: 3,
    extinct: true,
  },
  {
    id: 'tome.pulse',
    name: 'Rejestr Uderzeń',
    hours: 4,
    knowledge: 1,
    sanityPerQuarter: 3,
    domain: 4,
    extinct: false,
  },
  {
    id: 'tome.nodens',
    name: 'Szlak nad Otchłanią',
    hours: 4,
    knowledge: 1,
    sanityPerQuarter: 3,
    domain: 5,
    extinct: false,
  },
];

export function findTome(id: string): TomeDef | undefined {
  return TOMES.find((tome) => tome.id === id);
}

export const tomeDurationMs = (tome: TomeDef) => tome.hours * HOUR_MS;
export const tomeSanityCost = (tome: TomeDef) => tome.sanityPerQuarter * 4;

export const COLLEGE_COURSES = [
  { id: 'anatomy', branch: 'Anatomia Walki', hours: 1, silver: 40 },
  { id: 'order', branch: 'Służba Zakonu', hours: 4, silver: 120 },
  { id: 'craft', branch: 'Rzemiosło', hours: 12, silver: 300 },
  { id: 'trade', branch: 'Polityka i Handel', hours: 24, silver: 800 },
  { id: 'forbidden', branch: 'Nauki Wzbronione', hours: 168, silver: 2_000 },
] as const;
export type CollegeCourseId = (typeof COLLEGE_COURSES)[number]['id'];

export function findCourse(id: string) {
  return COLLEGE_COURSES.find((course) => course.id === id);
}

export const courseDurationMs = (hours: number) => hours * HOUR_MS;

export const CONSTELLATION_NODES = [
  { id: 'lamp', name: 'Latarnia', silver: 25, extinct: false, excludes: 'salt' },
  { id: 'salt', name: 'Sól na Progu', silver: 25, extinct: false, excludes: 'lamp' },
  { id: 'ash-star', name: 'Wygasła Popielna', silver: 100, extinct: true, excludes: null },
] as const;

export function findStarNode(id: string) {
  return CONSTELLATION_NODES.find((node) => node.id === id);
}

export const CHAPEL_STATS = ['composure', 'insight', 'stealth'] as const;
export type ChapelStat = (typeof CHAPEL_STATS)[number];
export const CHAPEL_TOIL_COST = 5;

export const FACTIONS = [
  { id: 'order', name: 'Zakon Latarników' },
  { id: 'guard', name: 'Straż Regencka' },
  { id: 'company', name: 'Kompania Solna' },
  { id: 'brotherhood', name: 'Bractwo Zaułków' },
] as const;
export type FactionId = (typeof FACTIONS)[number]['id'];

export const REPUTATION_RANKS = [
  'hostile',
  'suspect',
  'stranger',
  'known',
  'trusted',
  'kindred',
  'initiate',
] as const;

/** Progi reputacji. Zaufany zaczyna się na indeksie 4. */
export const REPUTATION_THRESHOLDS = [0, 40, 120, 280, 600, 1_200, 2_400] as const;
export const TRUSTED_RANK = 4;

export function reputationRank(value: number): number {
  let rank = 0;
  for (let index = 0; index < REPUTATION_THRESHOLDS.length; index += 1) {
    const threshold = REPUTATION_THRESHOLDS[index] ?? 0;
    if (value >= threshold) rank = index;
  }
  return rank;
}

/**
 * Straż i Bractwo wykluczają się powyżej Zaufanego (GDD 5.18).
 * Gdy rywal jest już wyżej, ta frakcja staje na progu Zaufanego.
 */
export function capReputation(
  faction: FactionId,
  value: number,
  all: Readonly<Record<string, number>>,
): number {
  const rival = faction === 'guard' ? 'brotherhood' : faction === 'brotherhood' ? 'guard' : null;
  if (!rival) return value;
  if (reputationRank(all[rival] ?? 0) <= TRUSTED_RANK) return value;
  const cap = (REPUTATION_THRESHOLDS[TRUSTED_RANK + 1] ?? 1_200) - 1;
  return Math.min(value, cap);
}

export const AMBASSADOR_GOODS = [
  { id: 'candle', faction: 'order' as const, seals: 2, name: 'Świeca seansu' },
  { id: 'pass', faction: 'guard' as const, seals: 3, name: 'Przepustka Straży' },
  { id: 'crate', faction: 'company' as const, seals: 4, name: 'Skrzynia Kompanii' },
  { id: 'lockpick', faction: 'brotherhood' as const, seals: 2, name: 'Wytrych zaułka' },
] as const;

export const AMBASSADOR_MIN_RANK = 3;
export const FACTION_ERRAND_TOIL = 10;
export const FACTION_ERRAND_REPUTATION = 25;
export const FACTION_ERRAND_SEAL = 1;

/** Kamienie Kalendarza: 1/1/2/3 Sigile ostatnio odblokowanego boga (GDD 5.12.5). */
export const CALENDAR_SIGIL_REWARDS: Record<number, number> = { 7: 1, 14: 1, 21: 2, 28: 3 };

export interface CalendarState {
  streak: number;
  lastDay: string | null;
  claimed: readonly number[];
}

export function previousUtcDay(day: string): string {
  const stamp = Date.parse(`${day}T00:00:00.000Z`);
  return new Date(stamp - 24 * 60 * 60_000).toISOString().slice(0, 10);
}

/**
 * Seria Kalendarza. Przerwanie cofa do ostatniego kamienia, bez ponownej nagrody
 * (GDD 5.24). Dzień 28 zamyka cykl: następny dzień zaczyna od 1.
 */
export function advanceCalendar(state: CalendarState, today: string): CalendarState {
  if (state.lastDay === today) return state;
  const milestones = [0, 7, 14, 21, 28];
  let streak = state.streak;
  let claimed = [...state.claimed];
  const yesterday = previousUtcDay(today);
  if (state.lastDay === yesterday) {
    streak += 1;
    if (streak > 28) {
      streak = 1;
      claimed = [];
    }
  } else if (state.lastDay) {
    const floor = [...milestones].reverse().find((mark) => mark <= streak && mark < 28) ?? 0;
    streak = floor;
    claimed = claimed.filter((day) => day <= streak);
  } else {
    streak = 1;
  }
  return { streak, lastDay: today, claimed };
}

export function calendarSigilsDue(state: CalendarState): { day: number; sigils: number }[] {
  return Object.entries(CALENDAR_SIGIL_REWARDS)
    .map(([day, sigils]) => ({ day: Number(day), sigils }))
    .filter((entry) => state.streak >= entry.day && !state.claimed.includes(entry.day));
}

/** Pogłębienie I–V (GDD 5.9): przy szansie 100% stopień rośnie, próg statystyki ×1,6. */
export const DEEPENING_MAX = 5;
export const DEEPENING_RESET_CHANCE_BP = 7_000;
export const DEEPENING_STAT_FACTOR = 1.6;

export function deepenedRequirement(requiredStat: number, degree: number): number {
  return Math.round(requiredStat * DEEPENING_STAT_FACTOR ** degree);
}

/** IV+ dokłada Grozę. Założenie Etapu 3: 2 Poczytalności za stopień powyżej III. */
export function deepeningSanity(degree: number): number {
  return degree >= 4 ? 2 * (degree - 3) : 0;
}

export const CASE_REWARDS = {
  minor: { keys: 1, sigilShards: 0, knowledge: 1, reputation: 40, ichor: 0 },
  serious: { keys: 0, sigilShards: 3, knowledge: 2, reputation: 80, ichor: 1 },
  partial: { keys: 0, sigilShards: 0, knowledge: 0, reputation: 10, ichor: 0, silver: 15 },
} as const;
