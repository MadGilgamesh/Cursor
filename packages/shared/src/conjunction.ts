/**
 * Zegar Koniunkcji, Latarnie, Patronat, Noc Zmarłych i Bezdeń (GDD 5.13, 5.25, 5.26, 6.7, 10.11).
 * Liczby bez wzoru w GDD są oznaczone przy stałej i w README Etapu 9.
 */
import { DAY_MS, HOUR_MS, MINUTE_MS } from './balance.js';
import type { CityId } from './world.js';
import { SLEEPERS, type SleeperId } from './hearth.js';
import { createRng } from './rng.js';

export const ACT_DAYS = 56;
export const ACT_DAY_MS = DAY_MS;
/** Próba akceptacyjna: 1 dzień aktu = 1 minuta. Produkcja zostaje przy dobie. */
export const ACT_ACCELERATED_DAY_MS = MINUTE_MS;

/** Zegar 0–100% w punktach bazowych (10 000 = 100%). Przyrost bazowy 1,9 p.p./dzień. */
export const CLOCK_MAX_BP = 10_000;
export const CLOCK_BASE_BP = 190;
export const CLOCK_MULT_MIN_BP = 3_000;
export const CLOCK_MULT_MAX_BP = 17_000;
export const CLOCK_THRESHOLDS_BP = [2_500, 5_000, 7_500] as const;
export const THRESHOLD_KEYS = 3;

/**
 * Limit gracza: 30 punktów dziennie, pełna wartość do 15, potem połowa (GDD: „malejący zwrot”).
 * Założenie Etapu 9: punkty 16–30 liczą się w połowie, obcięte w dół.
 */
export const PLAYER_POINT_FULL = 15;
export const PLAYER_POINT_CAP = 30;

export const LANTERN_POSITION_VIGOR = 20;
export const LANTERN_FINAL_POSITIONS = 3;
export const LANTERN_PARTICIPATION_KEYS = 2;
export const LANTERN_VICTORY_SIGIL = 1;
export const LANTERN_HELD_PL = 50;
export const LANTERN_DARK_PK = 80;
export const LANTERN_TAX_BP = 100;
export const LANTERN_HELD_MEMBER_KEYS = 1;

export const PATRON_DAYS = 30;
export const PATRON_VIGOR_MAX = 200;
export const PATRON_VIGOR_REGEN_BP = 1_000;
/** 3,5 h — dokładnie +14% wobec 4 h (GDD 5.12.5). */
export const PATRON_KEY_REGEN_MS = (7 * HOUR_MS) / 2;
/** Założenie: Pieczęć Patrona kosztuje 25 000 srebra. GDD nie podaje ceny. */
export const PATRON_SEAL_SILVER = 25_000;
export const PATRON_SEAL_GOOD = 'seal:patron';
export const PATRON_MONTHLY_VOUCHERS = 5;
export const RENAME_PEARLS = 5;
export const PEARL_PACK = 10;
export const REFERRAL_LEVEL = 15;
export const REFERRAL_TITLE_COUNTS = [1, 3, 10] as const;
export const REFERRAL_TITLES = ['Świadek', 'Pochodnia', 'Latarnia Rodu'] as const;
/** Założenie: polecenie z zakupem daje polecającemu 2 Perły, raz. */
export const PURCHASED_REFERRAL_PEARLS = 2;

/** Noc Zmarłych: 25 października – 1 listopada włącznie (UTC). */
export const DEAD_NIGHT_WAX = 10;
export const EVENT_KEY_COST = 30;
export const EVENT_KEY_LIMIT = 3;
export const EVENT_FRAME_COST = 20;
export const EVENT_FRAME_ID = 'frame.mourning';

export const FINALE_SIGIL_DOMAIN = 9;
export const COSMETICS = [
  { id: 'frame.abyss', name: 'Ramka Bezdeni', pearls: 8 },
  { id: 'backdrop.rlyeh', name: "Tło R'lyeh", pearls: 12 },
] as const;

export const CLOCK_PLAYER_ACTIONS = {
  seriousCase: { side: 'pl', points: 5 },
  conspiracy: { side: 'pl', points: 25 },
  wellGuardian: { side: 'pl', points: 2 },
  avatarFirst: { side: 'pl', points: 10 },
  avatarStar: { side: 'pl', points: 5 },
  awakeningTop: { side: 'pl', points: 15 },
  failedCase: { side: 'pk', points: 5 },
  cultOrder: { side: 'pk', points: 1 },
} as const;
export type ClockAction = keyof typeof CLOCK_PLAYER_ACTIONS;

export type ActPace = 'live' | 'accelerated';
export type ActFinale = 'pending' | 'repelled' | 'emergence';

export interface ActClock {
  day: number;
  clockBp: number;
  finale: ActFinale;
  thresholds: number[];
}

export const emptyActClock = (): ActClock => ({
  day: 0,
  clockBp: 0,
  finale: 'pending',
  thresholds: [],
});

/**
 * `Δ = 1,9% · clamp(0,3; 1,7; 1 + (PK − PL) / (PK + PL + 10·N))` (GDD 10.11).
 * Gdy mianownik jest zerem, mnożnik zostaje 1 — bez graczy zegar idzie bazowo.
 */
export function clockDayDeltaBp(pl: number, pk: number, active: number): number {
  const denom = pl + pk + 10 * active;
  const ratioBp = denom === 0 ? 0 : Math.round((10_000 * (pk - pl)) / denom);
  const multiplierBp = Math.min(CLOCK_MULT_MAX_BP, Math.max(CLOCK_MULT_MIN_BP, 10_000 + ratioBp));
  return Math.round((CLOCK_BASE_BP * multiplierBp) / 10_000);
}

export function effectivePlayerPoints(raw: number): number {
  const capped = Math.max(0, Math.min(PLAYER_POINT_CAP, Math.floor(raw)));
  const full = Math.min(PLAYER_POINT_FULL, capped);
  return full + Math.floor((capped - full) / 2);
}

/** Surowa suma PL+PK obcięta do 30, potem malejący zwrot, proporcjonalnie na strony. */
export function cappedSides(rawPl: number, rawPk: number): { pl: number; pk: number } {
  const plRaw = Math.max(0, Math.floor(rawPl));
  const pkRaw = Math.max(0, Math.floor(rawPk));
  const raw = plRaw + pkRaw;
  if (raw === 0) return { pl: 0, pk: 0 };
  const capped = Math.min(PLAYER_POINT_CAP, raw);
  const plShare = Math.floor((plRaw * capped) / raw);
  const effective = effectivePlayerPoints(capped);
  const pl = Math.floor((effective * plShare) / capped);
  return { pl, pk: effective - pl };
}

export function actDaySpan(pace: ActPace): number {
  return pace === 'accelerated' ? ACT_ACCELERATED_DAY_MS : ACT_DAY_MS;
}

export function actDayIndex(now: number, startedAt: number, pace: ActPace): number {
  if (now <= startedAt) return 0;
  return Math.floor((now - startedAt) / actDaySpan(pace));
}

export function closeActDay(
  state: ActClock,
  pl: number,
  pk: number,
  active: number,
): { state: ActClock; deltaBp: number; crossed: number[]; finaleStarted: boolean } {
  if (state.finale !== 'pending') {
    return { state, deltaBp: 0, crossed: [], finaleStarted: false };
  }
  const deltaBp = clockDayDeltaBp(pl, pk, active);
  const clockBp = Math.min(CLOCK_MAX_BP, state.clockBp + deltaBp);
  const day = state.day + 1;
  const crossed = CLOCK_THRESHOLDS_BP.filter(
    (threshold) => state.clockBp < threshold && clockBp >= threshold,
  );
  let finale: ActFinale = 'pending';
  if (clockBp >= CLOCK_MAX_BP) finale = 'emergence';
  else if (day >= ACT_DAYS) finale = 'repelled';
  return {
    state: {
      day,
      clockBp,
      finale,
      thresholds: [...state.thresholds, ...crossed],
    },
    deltaBp,
    crossed: [...crossed],
    finaleStarted: finale !== 'pending',
  };
}

/**
 * Finał: odparcie daje więcej Latarnikom (5) i mniej kultom (2).
 * Noc Wynurzenia odwraca to. Kto jest i tu, i tu, bierze wyższą z dwóch nagród.
 */
export function finaleSigils(
  finale: 'repelled' | 'emergence',
  contributed: boolean,
  cult: boolean,
): number {
  if (finale === 'repelled') {
    if (contributed) return 5;
    if (cult) return 2;
    return 0;
  }
  if (cult) return 5;
  if (contributed) return 2;
  return 0;
}

const LANTERN_CITY: Record<SleeperId, CityId> = {
  ulthaeg: 'salt',
  zharnuul: 'salt',
  maghulla: 'mire',
  ossarath: 'brink',
  ithrakel: 'ilmar',
  omm: 'salt',
  aelis: 'ilmar',
};

export const LANTERNS = SLEEPERS.map((sleeper) => ({
  sleeperId: sleeper.id,
  name: `Latarnia ${sleeper.name}`,
  city: LANTERN_CITY[sleeper.id],
}));

export function lanternCity(sleeperId: string): CityId | null {
  return LANTERNS.find((lantern) => lantern.sleeperId === sleeperId)?.city ?? null;
}

export type LanternPhase = 'apply' | 'choose' | 'battle' | 'payout';

/** pn–czw zgłoszenia, pt wybór, sob 19:00–20:30 UTC bitwa, nd wypłata (GDD 5.13). */
export function lanternPhase(now: number): LanternPhase {
  const date = new Date(now);
  const day = date.getUTCDay();
  if (day >= 1 && day <= 4) return 'apply';
  if (day === 5) return 'choose';
  if (day === 6) {
    const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    if (minutes >= 19 * 60 && minutes < 20 * 60 + 30) return 'battle';
    return 'choose';
  }
  return 'payout';
}

export function lanternScore(positions: number): number {
  return Math.max(0, positions) * 3;
}

export function lanternFalls(positions: number): boolean {
  return positions < LANTERN_FINAL_POSITIONS;
}

export type LanternResult = 'defender' | 'pretender' | 'dark' | 'uncontested' | 'empty';

export function resolveLantern(input: {
  hasDefender: boolean;
  hasPretender: boolean;
  defenderPositions: number;
  pretenderPositions: number;
}): LanternResult {
  if (!input.hasDefender && input.hasPretender) return 'uncontested';
  if (input.hasDefender && !input.hasPretender) return 'defender';
  if (!input.hasDefender && !input.hasPretender) return 'empty';
  const defenderFalls = lanternFalls(input.defenderPositions);
  const pretenderFalls = lanternFalls(input.pretenderPositions);
  if (defenderFalls && pretenderFalls) return 'dark';
  if (defenderFalls) return 'pretender';
  if (pretenderFalls) return 'defender';
  if (lanternScore(input.pretenderPositions) > lanternScore(input.defenderPositions)) {
    return 'pretender';
  }
  return 'defender';
}

export const lanternTax = (gross: number) => Math.floor((gross * LANTERN_TAX_BP) / 10_000);

export function patronActive(until: number | null, now: number): boolean {
  return until !== null && until > now;
}

export function extendPatron(until: number | null, now: number, days = PATRON_DAYS): number {
  const base = until !== null && until > now ? until : now;
  return base + days * DAY_MS;
}

export function keyRegenIntervalMs(patron: boolean): number {
  return patron ? PATRON_KEY_REGEN_MS : 4 * HOUR_MS;
}

export function deadNightOpen(now: number): boolean {
  const date = new Date(now);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (month === 9 && day >= 25) return true;
  if (month === 10 && day === 1) return true;
  return false;
}

export function referralTitles(qualified: number): string[] {
  return REFERRAL_TITLE_COUNTS.filter((count) => qualified >= count).map(
    (count, index) => REFERRAL_TITLES[index] ?? 'Świadek',
  );
}

/** Tygodniowy ranking Bezdeni: 1. miejsce 3 Sigile, 2–3 po 2, 4–10 po 1 (GDD 5.12.5). */
export function abyssRankSigils(rank: number): number {
  if (rank === 1) return 3;
  if (rank <= 3) return 2;
  if (rank <= 10) return 1;
  return 0;
}

/** Mutator tygodnia Bezdeni: ±10–30%, ziarno to poniedziałek UTC (GDD 10.4). */
export function abyssMutatorBp(weekKey: string): number {
  const rng = createRng(`abyss:${weekKey}`);
  const sign = rng.nextInt(0, 1) === 0 ? -1 : 1;
  return sign * rng.nextInt(1_000, 3_000);
}

export function findCosmetic(id: string) {
  return COSMETICS.find((item) => item.id === id);
}
