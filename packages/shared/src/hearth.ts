/**
 * Dom, rytuały, Przysięga, kulty, Skażenie i Rany (GDD 5.4, 5.21, 6.4–6.6, 6.10, 10.9).
 * Liczby bez wzoru w GDD są oznaczone przy stałej i w README Etapu 7.
 */
import { DAY_MS, HOUR_MS, MINUTE_MS, utcDay } from './balance.js';
import type { Rng } from './rng.js';

export const ASPECTS = ['depth', 'flame', 'swarm', 'bone', 'gale', 'void', 'pale'] as const;
export type Aspect = (typeof ASPECTS)[number];

export const SLEEPERS = [
  { id: 'ulthaeg', name: 'Ulthaeg', aspect: 'depth', aspectName: 'Głębia' },
  { id: 'zharnuul', name: "Zhar'Nuul", aspect: 'flame', aspectName: 'Zimny Ogień' },
  { id: 'maghulla', name: "Ma'Ghulla", aspect: 'swarm', aspectName: 'Rój' },
  { id: 'ossarath', name: 'Ossarath', aspect: 'bone', aspectName: 'Kość' },
  { id: 'ithrakel', name: 'Ithrakel', aspect: 'gale', aspectName: 'Wicher' },
  { id: 'omm', name: 'Omm', aspect: 'void', aspectName: 'Pustka' },
  { id: 'aelis', name: 'Aelis Blada', aspect: 'pale', aspectName: 'Blade Światło' },
] as const;
export type SleeperId = (typeof SLEEPERS)[number]['id'];

export function findSleeper(id: string) {
  return SLEEPERS.find((sleeper) => sleeper.id === id);
}

/** Cykl 1→2→…→7→1: każdy jest silny przeciw następnemu (GDD 2.2). */
export function aspectEdge(attacker: Aspect, defender: Aspect): number {
  const from = ASPECTS.indexOf(attacker);
  const to = ASPECTS.indexOf(defender);
  if (from < 0 || to < 0 || from === to) return 1;
  if (to === (from + 1) % ASPECTS.length) return 1.2;
  if (from === (to + 1) % ASPECTS.length) return 0.8;
  return 1;
}

/** Aspekt Domeny Portalu (GDD 5.12.2). Domena 7 to znowu Rój, Domena 8 znowu Głębia. */
const DOMAIN_ASPECTS: readonly Aspect[] = [
  'swarm',
  'depth',
  'flame',
  'bone',
  'pale',
  'gale',
  'swarm',
  'depth',
];

export function domainAspect(domain: number): Aspect | null {
  return DOMAIN_ASPECTS[domain - 1] ?? null;
}

export const CIRCLE_MAX = 5;
export const WRATH_STAT_FACTOR = 0.95;
export const CIRCLE_STAT_BP = 100;
export const CIRCLE_MATERIAL_BP = 100;
export const CULT_MATERIAL_FACTOR = 1.1;

export function circleBonus(circle: number): number {
  return Math.max(0, Math.min(CIRCLE_MAX, circle)) * (CIRCLE_STAT_BP / 10_000);
}

export const isOathWindow = (now: number) => new Date(now).getUTCDay() === 1;

/** Zmiana przysięgi działa od wtorku 00:00 UTC (GDD 5.4). */
export function oathEffectiveAt(mondayMs: number): number {
  const date = new Date(mondayMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function nextCircle(sameSleeper: boolean, circle: number): number {
  if (!sameSleeper) return 1;
  return Math.min(CIRCLE_MAX, Math.max(0, circle) + 1);
}

export interface HouseDef {
  id: string;
  name: string;
  price: number;
  buildMs: number;
  upkeep: number;
  rooms: number;
  /** Ilości bez liczby w GDD (mosiądz, szkło, marmur, ichor) są założeniem. */
  materials: Readonly<Record<string, number>>;
}

export const HOUSES: readonly HouseDef[] = [
  {
    id: 'room',
    name: 'Izba w kamienicy',
    price: 5_000,
    buildMs: HOUR_MS,
    upkeep: 15,
    rooms: 2,
    materials: {},
  },
  {
    id: 'hut',
    name: 'Chata rybacka',
    price: 40_000,
    buildMs: 6 * HOUR_MS,
    upkeep: 120,
    rooms: 4,
    materials: { wood: 60 },
  },
  {
    id: 'tenement',
    name: 'Kamienica',
    price: 250_000,
    buildMs: DAY_MS,
    upkeep: 750,
    rooms: 6,
    materials: { brick: 200, iron: 50 },
  },
  {
    id: 'captain',
    name: 'Dom kapitana',
    price: 1_200_000,
    buildMs: 3 * DAY_MS,
    upkeep: 3_600,
    rooms: 8,
    materials: { brick: 200, iron: 50, brass: 40, glass: 20 },
  },
  {
    id: 'manor',
    name: 'Dwór na Klifie',
    price: 6_000_000,
    buildMs: 7 * DAY_MS,
    upkeep: 18_000,
    rooms: 10,
    materials: { brick: 200, iron: 50, brass: 40, glass: 20, marble: 30, ichor: 1 },
  },
];

export function findHouse(id: string): HouseDef | undefined {
  return HOUSES.find((house) => house.id === id);
}

export const houseSellValue = (price: number) => Math.floor((price * 70) / 100);

export function missingMaterial(
  have: Readonly<Record<string, number>>,
  need: Readonly<Record<string, number>>,
): string | null {
  for (const [id, qty] of Object.entries(need)) {
    if ((have[id] ?? 0) < qty) return id;
  }
  return null;
}

export function houseUpkeepDays(paidThrough: string | null, today: string): number {
  if (!paidThrough) return 1;
  if (paidThrough >= today) return 0;
  let count = 0;
  let cursor = paidThrough;
  while (cursor < today && count < 4_000) {
    cursor = utcDay(Date.parse(`${cursor}T00:00:00.000Z`) + DAY_MS);
    count += 1;
  }
  return count;
}

export function settleUpkeep(
  upkeep: number,
  owedDays: number,
  silver: number,
): { paidDays: number; spent: number; arrears: boolean } {
  if (owedDays <= 0 || upkeep <= 0) return { paidDays: 0, spent: 0, arrears: false };
  const paidDays = Math.min(owedDays, Math.floor(silver / upkeep));
  return { paidDays, spent: paidDays * upkeep, arrears: paidDays < owedDays };
}

export const ROOMS = [
  'safe',
  'study',
  'training',
  'curios',
  'library',
  'kitchen',
  'cellar',
  'chapel',
  'bedroom',
] as const;
export type RoomId = (typeof ROOMS)[number];
export const ROOM_MAX_LEVEL = 5;
/** Założenie: poziom pokoju kosztuje 1 000 × nowy poziom. */
export const roomUpgradeCost = (nextLevel: number) => 1_000 * nextLevel;

/** Sypialnia +5% regeneracji Wigoru (GDD 5.21). Tik zasobu jeszcze tego nie mnoży. */
export function bedroomVigorBp(level: number, arrears: boolean): number {
  return !arrears && level >= 1 ? 500 : 0;
}

export const RITUAL_CATEGORIES = [
  'protective',
  'transmutation',
  'divination',
  'summoning',
  'cleansing',
  'opening',
] as const;
export type RitualCategory = (typeof RITUAL_CATEGORIES)[number];
export type RitualOutcome = 'success' | 'priced' | 'failure' | 'disaster';

export interface RitualDef {
  id: string;
  category: RitualCategory;
  name: string;
  knowledge: number;
  sanity: number;
  candles: number;
  ms: number;
  tome?: string;
  ichor?: number;
  shards?: number;
}

export const OPENING_TOME = 'tome.salt-psalter';
/** Świece rytuału, osobno od świec Seansu. Sprawa 3/3 dokłada je na półkę. */
export const CASE_RITUAL_CANDLES = 12;

export const RITUALS: readonly RitualDef[] = [
  {
    id: 'protective.salt',
    category: 'protective',
    name: 'Sól na Progu',
    knowledge: 0,
    sanity: 2,
    candles: 1,
    ms: 10 * MINUTE_MS,
  },
  {
    id: 'transmutation.essence',
    category: 'transmutation',
    name: 'Esencja Śpiącego',
    knowledge: 4,
    sanity: 4,
    candles: 1,
    ichor: 1,
    ms: HOUR_MS,
  },
  {
    id: 'divination.case',
    category: 'divination',
    name: 'Wróżba Sprawy',
    knowledge: 2,
    sanity: 3,
    candles: 1,
    ms: 10 * MINUTE_MS,
  },
  {
    id: 'summoning.directed',
    category: 'summoning',
    name: 'Ukierunkowany Seans',
    knowledge: 2,
    sanity: 4,
    candles: 2,
    ms: 30 * MINUTE_MS,
  },
  {
    id: 'cleansing.wash',
    category: 'cleansing',
    name: 'Obmycie',
    knowledge: 1,
    sanity: 2,
    candles: 1,
    ms: 10 * MINUTE_MS,
  },
  {
    id: 'opening.hideout',
    category: 'opening',
    name: 'Klucz Kryjówki',
    knowledge: 1,
    sanity: 5,
    candles: 1,
    ms: 10 * MINUTE_MS,
    tome: OPENING_TOME,
  },
  {
    id: 'opening.seal',
    category: 'opening',
    name: 'Rytuał Pieczęci',
    knowledge: 0,
    sanity: 1,
    candles: 0,
    shards: 10,
    ms: 10 * MINUTE_MS,
  },
];

export function findRitual(id: string): RitualDef | undefined {
  return RITUALS.find((ritual) => ritual.id === id);
}

/**
 * `p = clamp(0,15; 0,95; 0,5 + 0,01·(Wiedza − Wym) + 0,05·Piwnica + 0,1·(Poczytalność% − 0,5))`.
 */
export function ritualChance(
  knowledge: number,
  required: number,
  cellar: number,
  sanity: number,
  maxSanity: number,
): number {
  const ratio = maxSanity <= 0 ? 0 : sanity / maxSanity;
  const raw = 0.5 + 0.01 * (knowledge - required) + 0.05 * cellar + 0.1 * (ratio - 0.5);
  return Math.min(0.95, Math.max(0.15, raw));
}

/** Wagi w punktach bazowych. Suma 10 000; reszta zaokrąglenia ląduje w katastrofie. */
export function ritualWeightBp(chance: number): readonly { item: RitualOutcome; weight: number }[] {
  const scale = 10_000;
  const success = Math.round(chance * 0.8 * scale);
  const priced = Math.round(chance * 0.2 * scale);
  let failure = Math.round((1 - chance) * 0.85 * scale);
  let disaster = scale - success - priced - failure;
  if (disaster < 0) {
    failure += disaster;
    disaster = 0;
  }
  return [
    { item: 'success', weight: success },
    { item: 'priced', weight: priced },
    { item: 'failure', weight: Math.max(0, failure) },
    { item: 'disaster', weight: disaster },
  ];
}

export function rollRitual(rng: Rng, chance: number): RitualOutcome {
  return rng.pickWeighted(ritualWeightBp(chance));
}

/** Rytuał Pieczęci: 10 Odprysków → 1 Sigil, 20% na 2 (GDD 6.5). */
export const SEAL_DOUBLE_BP = 2_000;
export const sealSigilCount = (doubled: boolean) => (doubled ? 2 : 1);

/** Wiedza z tomu × (1 − Wiedza/100) (GDD 10.9). Przy zerze wychodzi pełna wartość tomu. */
export function tomeKnowledgeGain(amount: number, knowledge: number): number {
  return Math.round(amount * Math.max(0, 1 - knowledge / 100));
}

export const CONTAMINATION_MAX = 100;
export const MUTATION_THRESHOLDS = [20, 40, 60, 80] as const;
export const STAR_SALT_CONTAMINATION = 8;
export const DOMAIN_CONTAMINATION_FROM = 7;
export const CLEANSING_AMOUNT = 10;

export function addContamination(
  value: number,
  tenths: number,
  deltaTenths: number,
): { value: number; tenths: number } {
  const cap = CONTAMINATION_MAX * 10;
  const total = Math.min(cap, Math.max(0, value * 10 + tenths + deltaTenths));
  return { value: Math.floor(total / 10), tenths: total % 10 };
}

export function domainContaminationTenths(domain: number): number {
  return domain >= DOMAIN_CONTAMINATION_FROM ? 1 : 0;
}

export function nextMutationThreshold(value: number, chosen: readonly number[]): number | null {
  return (
    MUTATION_THRESHOLDS.find((threshold) => value >= threshold && !chosen.includes(threshold)) ??
    null
  );
}

export const MUTATIONS = [
  { id: 'gills', name: 'Skrzela', plus: '+20% połowu', minus: '−5% Życia na lądzie w dzień' },
  { id: 'third-eye', name: 'Trzecie Oko', plus: '+20% Wglądu', minus: '−10 max Poczytalności' },
  { id: 'chitin', name: 'Chitynowa Skóra', plus: '+8% Hartu', minus: '−4% Uniku' },
  { id: 'joints', name: 'Nadmiarowe Stawy', plus: '+8% Uniku', minus: '−1 zażyłość dziennie' },
  {
    id: 'tar-blood',
    name: 'Krew jak Smoła',
    plus: '+20% regeneracji Życia',
    minus: 'mikstury −30%',
  },
  {
    id: 'star-hunger',
    name: 'Głód Gwiazd',
    plus: '+10% Siły w nocy',
    minus: '−10% regeneracji Wigoru',
  },
] as const;
export type MutationId = (typeof MUTATIONS)[number]['id'];

export function offerMutations(rng: Rng, owned: readonly string[]): string[] {
  const bag = MUTATIONS.map((mutation) => mutation.id).filter((id) => !owned.includes(id));
  const picked: string[] = [];
  while (picked.length < 3 && bag.length > 0) {
    const index = rng.nextInt(0, bag.length - 1);
    const [id] = bag.splice(index, 1);
    if (id) picked.push(id);
  }
  return picked;
}

export const CULT_RANKS = ['listener', 'acolyte', 'priest', 'hierophant'] as const;
export type CultRank = (typeof CULT_RANKS)[number];
export const CULT_INVITE_LEVEL = 20;
export const CULT_INVITE_CIRCLE = 2;
/** Założenie: zlecenie kultowe daje 15 Podejrzenia. */
export const CULT_ORDER_SUSPICION = 15;
export const SUSPICION_MAX = 100;
/** Założenie progów rang: 0 / 3 / 8 / 15 zleceń. */
export function cultRankFor(orders: number): CultRank {
  if (orders >= 15) return 'hierophant';
  if (orders >= 8) return 'priest';
  if (orders >= 3) return 'acolyte';
  return 'listener';
}

export const WOUND_CHANCE_BP = 1_500;
export const WOUND_EYE_DREAD = 8;

export interface WoundRoll {
  id: 'ribs' | 'fingers' | 'eye';
  hours: number;
}

/** Śmierć w walce: 15% Rany. Oko tylko przy Grozie ≥ 8 i trwa 48 h (GDD 6.10). */
export function rollWound(rng: Rng, dread: number): WoundRoll | null {
  if (!rng.rollBp(WOUND_CHANCE_BP)) return null;
  if (dread >= WOUND_EYE_DREAD && rng.rollBp(5_000)) return { id: 'eye', hours: 48 };
  return { id: rng.rollBp(5_000) ? 'ribs' : 'fingers', hours: rng.nextInt(6, 24) };
}

export const SALT_BUFF_MS = 4 * HOUR_MS;
export const HIDEOUT_SILVER = 250;
export const MARTYR_SILVER = 500;
export const CULT_ORDER_SILVER = 200;
export const DIRECTED_ECHO = 'echo.seance.1';
