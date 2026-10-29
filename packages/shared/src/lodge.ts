/**
 * Loże, Przyzwania, Kuter, Sny i Przebudzenie Boga (GDD 5.14, 6.8, 5.12.1, 10.10, 10.13).
 * Liczby bez wzoru w GDD są oznaczone jako założenie i opisane w README.
 */
import { HOUR_MS } from './balance.js';
import { createRng } from './rng.js';

export const LODGE_ROLES = ['master', 'elder', 'treasurer', 'sibling', 'novice'] as const;
export type LodgeRole = (typeof LODGE_ROLES)[number];

export const LODGE_ACTIONS = [
  'disband',
  'setRole',
  'learnSkill',
  'setRecruitment',
  'invite',
  'kick',
  'withdraw',
  'buyScroll',
  'buildCutter',
  'startVoyage',
  'donate',
  'signup',
] as const;
export type LodgeAction = (typeof LODGE_ACTIONS)[number];

const GRANTS: Record<LodgeRole, readonly LodgeAction[]> = {
  master: LODGE_ACTIONS,
  elder: ['invite', 'kick', 'buyScroll', 'buildCutter', 'startVoyage', 'donate', 'signup'],
  treasurer: ['withdraw', 'donate', 'signup'],
  sibling: ['donate', 'signup'],
  novice: ['donate'],
};

export function lodgeAllows(role: LodgeRole, action: LodgeAction): boolean {
  return GRANTS[role].includes(action);
}

export const isLodgeRole = (value: string): value is LodgeRole =>
  (LODGE_ROLES as readonly string[]).includes(value);

/** St. I 50 000, dalej ×2 na stopień (GDD 10.10). W tym etapie Stopnie I–III. */
export const SCROLL_TIERS = [1, 2, 3] as const;
export const scrollCost = (tier: number) => 50_000 * 2 ** (tier - 1);
/** Sigile z Przyzwania: tyle, ile stopień Zwoju (GDD: 1–4 według stopnia; tu I–III). */
export const scrollSigils = (tier: number) => tier;
/** Założenie: srebro z rytuału, dzielone między zapisanych. */
export const SUMMON_SILVER = 1_000;
export const SUMMON_SIGNUP_MS = 30 * 60_000;

/** XP loży = 2% XP członków + darowizny (GDD 5.14). Darowizna: 1 srebro = 1 XP. */
export const MEMBER_XP_SHARE_BP = 200;
export function lodgeXp(donationXp: number, memberExperience: number): number {
  return donationXp + Math.floor((memberExperience * MEMBER_XP_SHARE_BP) / 10_000);
}

/** Założenie: poziom 1 od zera, kolejny co 10 000 XP. */
export const LODGE_XP_PER_LEVEL = 10_000;
export function lodgeLevel(xp: number): number {
  return 1 + Math.floor(xp / LODGE_XP_PER_LEVEL);
}

export const skillPoints = (level: number) => Math.max(0, level - 1);

export const LODGE_SKILLS = ['table', 'witnesses', 'fleet', 'walls', 'keykeeper', 'seats'] as const;
export type LodgeSkill = (typeof LODGE_SKILLS)[number];

export const isLodgeSkill = (value: string): value is LodgeSkill =>
  (LODGE_SKILLS as readonly string[]).includes(value);

export const LODGE_BASE_SEATS = 10;
export function lodgeSeats(skills: readonly string[]): number {
  return LODGE_BASE_SEATS + (skills.includes('seats') ? 5 : 0);
}

/** *Klucznik*: +1 do Pęku Kluczy członków (GDD 5.14). */
export function keyRingBonus(skills: readonly string[]): number {
  return skills.includes('keykeeper') ? 1 : 0;
}

/** Założenie: budowa Kutra kosztuje 20 000 srebra ze skarbca. */
export const CUTTER_COST = 20_000;
export const VOYAGE_MS = HOUR_MS;
/** *Coś Większego*: 15% (założenie). Od 3 zapisanych rejs walczy, inaczej tnie sieci. */
export const SOMETHING_BIGGER_BP = 1_500;
export const VOYAGE_FIGHT_SIGNUPS = 3;

export interface VoyageOutcome {
  bigger: boolean;
  fought: boolean;
  catch: number;
}

export function voyageOutcome(seed: string, signups: number): VoyageOutcome {
  const bigger = createRng(seed).rollBp(SOMETHING_BIGGER_BP);
  if (!bigger) return { bigger: false, fought: false, catch: 2 * signups };
  const fought = signups >= VOYAGE_FIGHT_SIGNUPS;
  return { bigger: true, fought, catch: fought ? 2 * signups : 0 };
}

export const DREAM_PATHS = ['calm', 'depths', 'shared'] as const;
export type DreamPath = (typeof DREAM_PATHS)[number];
export const DREAM_MAX_MS = 12 * HOUR_MS;
export const isDreamPath = (value: string): value is DreamPath =>
  (DREAM_PATHS as readonly string[]).includes(value);

export function dreamSleptMs(start: number, now: number): number {
  return Math.max(0, Math.min(DREAM_MAX_MS, now - start));
}

/** +20% regeneracji Poczytalności (3 na godzinę) za czas snu. */
export function calmSanityBonus(sleptMs: number): number {
  const hours = Math.floor(dreamSleptMs(0, sleptMs) / HOUR_MS);
  return Math.floor((hours * 3 * 2_000) / 10_000);
}

export function depthsDream(seed: string): 'shard' | 'nightmare' | 'empty' {
  const roll = createRng(seed).nextInt(0, 99);
  if (roll < 30) return 'shard';
  if (roll < 50) return 'nightmare';
  return 'empty';
}

export const NIGHTMARE_SANITY = 5;
export const MENTOR_MIN_LEVEL = 15;

/** Poniedziałek 00:00 UTC jako data `RRRR-MM-DD`. */
export function awakeningWeekStart(now: number): string {
  const date = new Date(now);
  const weekday = date.getUTCDay();
  const fromMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - fromMonday,
  );
  return new Date(monday).toISOString().slice(0, 10);
}

export function awakeningDomain(weekStart: string, domains = 6): number {
  const [year, month, day] = weekStart.split('-').map(Number);
  if (!year || !month || !day) throw new RangeError('Zły tydzień Przebudzenia');
  const weeks = Math.floor(Date.UTC(year, month - 1, day) / (7 * 24 * 60 * 60 * 1000));
  return (((weeks % domains) + domains) % domains) + 1;
}

/** Gracz, który nie pokonał awatara budzącego się boga, dostaje +25% materiałów tej Domeny. */
export function awakeningMaterialBonus(
  now: number,
  domain: number,
  clearedDomain: number,
): boolean {
  return awakeningDomain(awakeningWeekStart(now)) === domain && clearedDomain < domain;
}

export const AWAKENING_GROWTH = 1.06;
export function awakeningStat(avatarStat: number, level: number): number {
  return Math.round(avatarStat * AWAKENING_GROWTH ** level);
}

/** Mutator tygodnia: ±10–30% wokół 1, z ziarna tygodnia (GDD 10.13). */
export function awakeningMutator(weekStart: string): number {
  const span = createRng(`przebudzenie:${weekStart}`).nextInt(0, 1_000);
  return 0.9 + (span / 1_000) * 0.4;
}

/** Założenie progów Kwitów: miejsce 1 dostaje 3, miejsca 2–10 po 1. */
export function awakeningReceipts(rank: number): number {
  if (rank <= 0) return 0;
  if (rank === 1) return 3;
  if (rank <= 10) return 1;
  return 0;
}
