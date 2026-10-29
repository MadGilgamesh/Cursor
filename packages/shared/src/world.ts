/**
 * Cztery miasta, doba, pogoda, podróż i wierzchowce (GDD 5.16, Etap 4).
 * Czasy tras, które GDD podaje tylko jako widełki 20–90 min, są założeniem.
 */
import { HOUR_MS, MINUTE_MS } from './balance.js';
import { createRng } from './rng.js';

export const CITIES = ['salt', 'ilmar', 'mire', 'brink'] as const;
export type CityId = (typeof CITIES)[number];

export const CITY_NAMES: Record<CityId, string> = {
  salt: 'Sól',
  ilmar: 'Ilmar',
  mire: 'Mgławiec',
  brink: 'Kres',
};

/** Doba gry: 3 h dnia i 1 h Godziny Wilka. */
export const GAME_DAY_MS = 4 * HOUR_MS;
export const WOLF_HOUR_MS = HOUR_MS;
/** Pływy i pogoda zmieniają się co 2 h, deterministycznie ze znacznika czasu. */
export const WORLD_SLOT_MS = 2 * HOUR_MS;

export const WEATHERS = ['clear', 'fog', 'storm', 'red-moon'] as const;
export type WeatherId = (typeof WEATHERS)[number];

export const WEATHER_NAMES: Record<WeatherId, string> = {
  clear: 'pogodnie',
  fog: 'mgła',
  storm: 'sztorm',
  'red-moon': 'czerwony księżyc',
};

/** Mgła +10%, sztorm +25%. Czerwony księżyc nie wydłuża drogi. */
const WEATHER_TRAVEL: Record<WeatherId, number> = {
  clear: 1,
  fog: 1.1,
  storm: 1.25,
  'red-moon': 1,
};

export function isWolfHour(now: number): boolean {
  return now % GAME_DAY_MS >= GAME_DAY_MS - WOLF_HOUR_MS;
}

export function tideAt(now: number): 'low' | 'high' {
  return Math.floor(now / WORLD_SLOT_MS) % 2 === 0 ? 'low' : 'high';
}

export function weatherAt(now: number): WeatherId {
  const slot = Math.floor(now / WORLD_SLOT_MS);
  const rng = createRng(`pogoda:${slot}`);
  return WEATHERS[rng.nextInt(0, WEATHERS.length - 1)] ?? 'clear';
}

/**
 * Czas bazowy w minutach, w obie strony taki sam.
 * Założenie wewnątrz widełek 20–90 z GDD 5.16.
 */
const ROUTE_MINUTES: Record<string, number> = {
  'brink:salt': 70,
  'ilmar:salt': 40,
  'mire:salt': 50,
  'brink:ilmar': 60,
  'ilmar:mire': 90,
  'brink:mire': 80,
};

export function routeMinutes(from: CityId, to: CityId): number | null {
  if (from === to) return null;
  const key = [from, to].sort().join(':');
  return ROUTE_MINUTES[key] ?? null;
}

export const MOUNTS = {
  pony: { name: 'Ślepy Kuc', cut: 0.15, slots: 2, silverPerDay: 40, minLevel: 1, sanity: 0 },
  hound: { name: 'Nocny Ogar', cut: 0.3, slots: 4, silverPerDay: 90, minLevel: 1, sanity: 0 },
  faceless: { name: 'Bezlicy', cut: 0.5, slots: 6, silverPerDay: 200, minLevel: 30, sanity: 1 },
} as const;
export type MountId = keyof typeof MOUNTS;
export const MOUNT_IDS = Object.keys(MOUNTS) as MountId[];

export function travelDurationMs(
  from: CityId,
  to: CityId,
  weather: WeatherId,
  mount: MountId | null,
): number | null {
  const minutes = routeMinutes(from, to);
  if (minutes === null) return null;
  const cut = mount ? MOUNTS[mount].cut : 0;
  return Math.round(minutes * MINUTE_MS * WEATHER_TRAVEL[weather] * (1 - cut));
}

/** Nocna zasadzka: 10%, Skrytość ścina po 0,5 punktu procentowego, próg 1%. */
export function ambushChanceBp(night: boolean, stealth: number): number {
  if (!night) return 0;
  return Math.max(100, 1000 - stealth * 50);
}

export const AMBUSH_KINDS = ['fight', 'toll', 'cargo'] as const;
export type AmbushKind = (typeof AMBUSH_KINDS)[number];

export function travelInProgress(
  travelTo: string | null,
  travelEndsAt: number | null,
  now: number,
): boolean {
  return travelTo !== null && travelEndsAt !== null && travelEndsAt > now;
}

export function rollAmbush(seed: string, chanceBp: number): AmbushKind | null {
  const rng = createRng(seed);
  if (!rng.rollBp(chanceBp)) return null;
  return AMBUSH_KINDS[rng.nextInt(0, AMBUSH_KINDS.length - 1)] ?? 'toll';
}

/** Sesja Sanatorium: 30 min, +20 Poczytalności, srebro `30·L^1,1` (GDD 5.22). */
export const CLINIC_MS = 30 * MINUTE_MS;
export const CLINIC_SANITY = 20;
export const clinicSilver = (level: number) => Math.round(30 * level ** 1.1);

/** Oczyszczenie: 50 srebra zdejmuje 10 Skażenia. Założenie, dopóki rytuały nie podadzą ceny. */
export const PURIFY_SILVER = 50;
export const PURIFY_AMOUNT = 10;

/** Pieczętowanie: 20% maks. Życia. Srebro `15·L` to założenie (GDD milczy o kwocie). */
export const SEAL_LIFE_BP = 2000;
export const SEAL_DAILY_CAP = 3;
export const sealSilver = (level: number) => 15 * level;

export const CITY_RESIDENTS: Record<
  Exclude<CityId, 'salt'>,
  readonly { id: string; name: string }[]
> = {
  ilmar: [
    { id: 'idris', name: 'Mistrz pieczęci Idris' },
    { id: 'lior', name: 'Uczennica Lior' },
  ],
  mire: [
    { id: 'moire', name: 'Zielarka Moire' },
    { id: 'silt', name: 'Przewoźnik Silt' },
  ],
  brink: [
    { id: 'kaspar', name: 'Brat Kaspar' },
    { id: 'nera', name: 'Słuchaczka Nera' },
  ],
};
