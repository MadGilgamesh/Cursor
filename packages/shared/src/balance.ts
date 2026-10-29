/**
 * Plik balansu (GDD rozdz. 10). Wszystkie liczby etapu są tutaj, a każda zmiana
 * wymaga podniesienia `BALANCE_VERSION` — wyniki zapisują wersję, więc hotfix
 * balansu nie zmienia historii (GDD 9.2).
 *
 * Funkcje są czyste. Tam, gdzie wynik trafia do stanu gry, używamy wyłącznie
 * operacji dokładnie zaokrąglanych w IEEE 754 (dodawanie, mnożenie, dzielenie,
 * `Math.sqrt`) albo zaokrąglamy wynik do liczby całkowitej, dzięki czemu klient
 * i serwer zawsze dają ten sam wynik. Potęgi niecałkowite (`Math.pow`) służą
 * tylko wartościom, które od razu zaokrąglamy (tabele wrogów, ceny).
 *
 * Wartości oznaczone „założenie Etapu 1” nie mają liczby w GDD — dobraliśmy je
 * tak, by pasowały do tabel rozdz. 10, i opisaliśmy w README (sekcja Etap 1).
 */
import { applyBp } from './fixed-point.js';

export const BALANCE_VERSION = 2;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** `L^1,25` jako `L·√√L` — deterministycznie w każdym silniku JS. */
export const pow125 = (value: number) => value * Math.sqrt(Math.sqrt(value));

const clamp = (min: number, max: number, value: number) => Math.min(max, Math.max(min, value));

/** `base^n` dla całkowitego n przez mnożenie — dokładnie powtarzalne. */
function powInt(base: number, exponent: number): number {
  let result = 1;
  for (let i = 0; i < exponent; i++) result *= base;
  return result;
}

// ─── Zasoby (GDD 4.2, 10.1) ────────────────────────────────────────────────

export const RESOURCE_KINDS = ['life', 'vigor', 'toil', 'sanity'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** Parametry zasobów z GDD 4.2 i 10.1 (bez Patronatu — Etap 9). */
export const RESOURCE_RULES = {
  /** Życie: max `100 + 20·(L−1) + Σ sprzęt`; regeneracja 5% max co 10 min. */
  life: { baseMax: 100, maxPerLevel: 20, regenBpOfMax: 500, regenIntervalMs: 10 * MINUTE_MS },
  /** Wigor: max 100; +5 co 10 min (pełny w 3 h 20 min). */
  vigor: { baseMax: 100, regenAmount: 5, regenIntervalMs: 10 * MINUTE_MS },
  /** Znój: max 50 (Włóczęga +10%); +1 co 6 min (pełny w 5 h). */
  toil: { baseMax: 50, regenAmount: 1, regenIntervalMs: 6 * MINUTE_MS },
  /** Poczytalność: max `100 − 0,75·Wiedza`; +3 co godzinę. */
  sanity: { baseMax: 100, knowledgePenaltyBp: 7_500, regenAmount: 3, regenIntervalMs: HOUR_MS },
} as const;

export interface ResourceContext {
  level: number;
  /** Wiedza Zakazana 0–80 (GDD 6.2); do czasu Etapu 3 zawsze 0. */
  knowledge: number;
  /** Życie ze sprzętu (GDD 10.1: „+ Σ sprzęt”). */
  lifeBonus?: number;
  /** Premia do limitu Znoju w punktach bazowych (Włóczęga: +10%). */
  toilBonusBp?: number;
}

export function resourceMax(kind: ResourceKind, ctx: ResourceContext): number {
  switch (kind) {
    case 'life':
      return (
        RESOURCE_RULES.life.baseMax +
        RESOURCE_RULES.life.maxPerLevel * (ctx.level - 1) +
        (ctx.lifeBonus ?? 0)
      );
    case 'vigor':
      return RESOURCE_RULES.vigor.baseMax;
    case 'toil':
      return (
        RESOURCE_RULES.toil.baseMax + applyBp(RESOURCE_RULES.toil.baseMax, ctx.toilBonusBp ?? 0)
      );
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

/** Dodaje (albo odejmuje) zasób po regeneracji; leczenie nie przekracza max, nagrody (`allowOverMax`) mogą. */
export function adjustResource(
  kind: ResourceKind,
  stored: StoredResource,
  now: number,
  max: number,
  delta: number,
  { allowOverMax = false } = {},
): StoredResource {
  if (!Number.isSafeInteger(delta)) throw new RangeError(`Niepoprawna zmiana: ${delta}`);
  // Pełny zasób ma `updatedAt = now`, więc zegar regeneracji po spadku startuje od tej chwili.
  const current = materializeResource(kind, stored, now, max);
  let value = current.value + delta;
  if (delta > 0 && !allowOverMax) value = Math.min(value, Math.max(max, current.value));
  return { value: Math.max(0, value), updatedAt: current.updatedAt };
}

// ─── Statystyki i Fechtownia (GDD 5.1, 5.2, 10.3) ──────────────────────────

export const COMBAT_STATS = ['strength', 'defense', 'accuracy', 'evasion'] as const;
export type CombatStat = (typeof COMBAT_STATS)[number];

/** Statystyki trzymamy w setnych częściach punktu (liczby całkowite), bo przyrosty treningu są ułamkowe. */
export const STAT_SCALE = 100;

/**
 * Założenie Etapu 1: ciało topielca zaczyna z 20 w każdej statystyce walki —
 * nieco poniżej wroga z piętra 1 (25), a dzień treningu daje ~250 (GDD 10.3: dzień 1).
 */
export const STARTING_STAT = 20;

export interface TrainingHall {
  hall: number;
  name: string;
  /** Bazowy mnożnik przyrostu G (GDD 10.3). */
  gain: number;
  /** Wymagana suma statystyk bazowych (punkty). */
  requiredStatSum: number;
  /** Jednorazowa opłata za wstęp (srebro). */
  unlockSilver: number;
  /** Etap, w którym sala jest dostępna (GDD 11: Etap 1 — sale 1–2). */
  stage: number;
}

export const TRAINING_HALLS: readonly TrainingHall[] = [
  { hall: 1, name: 'Piwnica', gain: 4, requiredStatSum: 0, unlockSilver: 0, stage: 1 },
  {
    hall: 2,
    name: 'Sala Kapitańska',
    gain: 6,
    requiredStatSum: 2_000,
    unlockSilver: 5_000,
    stage: 1,
  },
  {
    hall: 3,
    name: 'Zbrojownia Zakonu',
    gain: 9,
    requiredStatSum: 15_000,
    unlockSilver: 60_000,
    stage: 2,
  },
  {
    hall: 4,
    name: 'Sala Mistrzów',
    gain: 13,
    requiredStatSum: 60_000,
    unlockSilver: 400_000,
    stage: 3,
  },
  {
    hall: 5,
    name: 'Krypta Pierwszych',
    gain: 18,
    requiredStatSum: 200_000,
    unlockSilver: 2_000_000,
    stage: 4,
  },
];

/** Najwyższa sala dostępna w bieżącym etapie gry. */
export const MAX_TRAINING_HALL_THIS_STAGE = 2;

export const TRAINING_VIGOR_STEP = 5;

export function trainingHall(hall: number): TrainingHall {
  const found = TRAINING_HALLS.find((candidate) => candidate.hall === hall);
  if (!found) throw new RangeError(`Nieznana sala: ${hall}`);
  return found;
}

/** `B_erud = 0,5 · Erudycja / (Erudycja + 5 000)` — Erudycja rośnie od Etapu 3, do tego czasu 0. */
export const eruditionBonus = (erudition: number) => (0.5 * erudition) / (erudition + 5_000);

/**
 * Przyrost statystyki z treningu (GDD 10.3):
 * `Δstat = W · G · (1 + B_erud) · 200 / (200 + √stat)`.
 * Liczymy porcjami po 5 Wigoru, bo statystyka rośnie w trakcie treningu. Wynik w setnych.
 */
export function trainingGainCenti(
  statCenti: number,
  vigor: number,
  hallGain: number,
  erudition = 0,
): number {
  if (!Number.isSafeInteger(vigor) || vigor < 0 || vigor % TRAINING_VIGOR_STEP !== 0) {
    throw new RangeError(`Wigor treningu musi być wielokrotnością ${TRAINING_VIGOR_STEP}`);
  }
  const multiplier = 1 + eruditionBonus(erudition);
  let stat = statCenti;
  for (let spent = 0; spent < vigor; spent += TRAINING_VIGOR_STEP) {
    const units = stat / STAT_SCALE;
    const delta =
      (TRAINING_VIGOR_STEP * hallGain * multiplier * 200 * STAT_SCALE) / (200 + Math.sqrt(units));
    stat += Math.round(delta);
  }
  return stat - statCenti;
}

// ─── Walka (GDD 5.3, 10.4) ─────────────────────────────────────────────────

export const COMBAT_MAX_ROUNDS = 25;
export const COMBAT_ENGINE_VERSION = 1;

export const CLASS_IDS = ['butcher', 'occultist', 'marksman', 'vagrant'] as const;
export type ClassId = (typeof CLASS_IDS)[number];
/** Klasy z własnym zestawem przedmiotów; Włóczęga nosi dowolne. */
export const SET_CLASS_IDS = ['butcher', 'occultist', 'marksman'] as const;
export type SetClassId = (typeof SET_CLASS_IDS)[number];

/** Mnożniki Hartu i Uniku wroga dla klasy (GDD 10.4) w punktach bazowych. */
export const CLASS_PENETRATION: Record<
  ClassId | 'none',
  { kDefenseBp: number; kEvasionBp: number }
> = {
  butcher: { kDefenseBp: 8_700, kEvasionBp: 8_700 },
  occultist: { kDefenseBp: 7_500, kEvasionBp: 10_000 },
  marksman: { kDefenseBp: 10_000, kEvasionBp: 7_500 },
  vagrant: { kDefenseBp: 10_000, kEvasionBp: 10_000 },
  none: { kDefenseBp: 10_000, kEvasionBp: 10_000 },
};

/** Unikaty klas (GDD 5.5). */
export const CLASS_UNIQUES = {
  /** Rzeźnik — *Krwawy szał*: przy Życiu < 30% +20% Siły. */
  butcherFrenzyLifeBp: 3_000,
  butcherFrenzyStrengthBp: 2_000,
  /**
   * Okultysta — *Słowo*: 1× na walkę. Założenie Etapu 1 (GDD: „zależne od Wiedzy”):
   * pierwszy trafiony cios ×(1,25 + 0,01·Wiedza).
   */
  occultistWordBase: 1.25,
  occultistWordPerKnowledge: 0.01,
  /** Włóczęga: +10% Znoju max. */
  vagrantToilBp: 1_000,
} as const;

/** Szansa trafienia: `clamp(0,10; 0,95; 1,3 · Cel / (Cel + Unik_wroga · k_unik))`. */
export function hitChance(accuracy: number, enemyEvasion: number, kEvasion = 1): number {
  const denominator = accuracy + enemyEvasion * kEvasion;
  if (denominator <= 0) return 0.95;
  return clamp(0.1, 0.95, (1.3 * accuracy) / denominator);
}

/** `R = clamp(0,25; 2,0; 2 · Siła / (Siła + Hart_wroga · k_hart))`. */
export function damageRatio(strength: number, enemyDefense: number, kDefense = 1): number {
  const denominator = strength + enemyDefense * kDefense;
  if (denominator <= 0) return 1;
  return clamp(0.25, 2, (2 * strength) / denominator);
}

/** Obrażenia broni bez broni w ręku (pięści). Założenie Etapu 1: połowa Stopnia 1. */
export const UNARMED_DAMAGE = 10;

/**
 * `D_broni = 20 · 1,35^(stopień−1) · jakość · (1 + 0,05·wzmocnienie) · (1 + 0,02·poziom_klasy)`.
 * Jakość w punktach bazowych (10 000 = 100%).
 */
export function weaponDamage(
  tier: number,
  qualityBp = 10_000,
  enhancement = 0,
  classLevel = 0,
): number {
  return (
    20 *
    powInt(1.35, tier - 1) *
    (qualityBp / 10_000) *
    (1 + 0.05 * enhancement) *
    (1 + 0.02 * classLevel)
  );
}

export const CRIT_MULTIPLIER = 1.5;
export const CRIT_CHANCE_BP = 500;
/** Losowy rozrzut obrażeń V = 0,85–1,15 (w punktach bazowych). */
export const DAMAGE_VARIANCE_BP = { min: 8_500, max: 11_500 } as const;

/** Wróg Studni / Łowów na piętrze f (GDD 10.4): `S(f) = 15·f^1,8 + 10`. */
export const enemyStat = (floor: number) => Math.round(15 * floor ** 1.8 + 10);
/** `Życie(f) = 60 + 20·f + 0,25·f²`. */
export const enemyLife = (floor: number) => Math.round(60 + 20 * floor + 0.25 * floor * floor);
/** `D_wroga(f) = 8 + 3·f`. */
export const enemyDamage = (floor: number) => 8 + 3 * floor;
/**
 * Poziom wroga Lw (do XP i srebra). GDD nie podaje go dla pięter — założenie Etapu 1:
 * `round(6 + 0,6·f)`, dopasowane do zalecanych poziomów Domeny 1 (10.13: f 1→21 ↔ L 7→18).
 */
export const enemyLevel = (floor: number) => Math.round(6 + 0.6 * floor);
/** Nazwani mają +10% statystyk (GDD 10.4). */
export const NAMED_STAT_BONUS_BP = 1_000;

// ─── Łowy i Kręgi (GDD 5.3, 10.4) ──────────────────────────────────────────

export const HUNT_VIGOR_COST = 10;
export const HUNT_REFRESH_TOIL_COST = 2;
export const HUNT_ROTATION_MS = 30 * MINUTE_MS;
export const HUNT_RANDOM_TARGETS = 4;
export const HUNT_NAMED_TARGETS = 2;
/** Awans: 10 zwycięstw nad nazwanymi (GDD 5.3). */
export const CIRCLE_PROMOTION_WINS = 10;

export interface CircleDef {
  /** 9 = Krąg IX … 1 = Krąg I, 0 = Krąg Zerowy. */
  circle: number;
  numeral: string;
  floorMin: number;
  floorMax: number;
  /** Etap, w którym Krąg jest dostępny (Etap 1: IX–VII). */
  stage: number;
}

export const CIRCLES: readonly CircleDef[] = [
  { circle: 9, numeral: 'IX', floorMin: 1, floorMax: 5, stage: 1 },
  { circle: 8, numeral: 'VIII', floorMin: 5, floorMax: 10, stage: 1 },
  { circle: 7, numeral: 'VII', floorMin: 10, floorMax: 18, stage: 1 },
  { circle: 6, numeral: 'VI', floorMin: 18, floorMax: 28, stage: 2 },
  { circle: 5, numeral: 'V', floorMin: 28, floorMax: 40, stage: 2 },
  { circle: 4, numeral: 'IV', floorMin: 40, floorMax: 52, stage: 2 },
  { circle: 3, numeral: 'III', floorMin: 52, floorMax: 65, stage: 5 },
  { circle: 2, numeral: 'II', floorMin: 65, floorMax: 80, stage: 5 },
  { circle: 1, numeral: 'I', floorMin: 80, floorMax: 95, stage: 5 },
  { circle: 0, numeral: 'Zerowy', floorMin: 95, floorMax: 110, stage: 5 },
];

export const STARTING_CIRCLE = 9;
/** Najwyższy Krąg dostępny w bieżącym etapie (Etap 1: VII). */
export const TOP_CIRCLE_THIS_STAGE = 7;

export function circleDef(circle: number): CircleDef {
  const found = CIRCLES.find((candidate) => candidate.circle === circle);
  if (!found) throw new RangeError(`Nieznany Krąg: ${circle}`);
  return found;
}

/** Mnożnik Kręgu dla XP i srebra (GDD 10.2): losowy 1,0 / nazwany 1,5 / strażnik 3,0 (w dziesiątych). */
export const CIRCLE_MULTIPLIER_TENTHS = { random: 10, named: 15, guardian: 30 } as const;
export type TargetRank = keyof typeof CIRCLE_MULTIPLIER_TENTHS;

/**
 * XP za walkę (GDD 10.2): `10 · (2·Lw + 4) · m_kręgu`, Lw maks. L+5;
 * wróg słabszy niż L−10 daje ×0,25.
 */
export function fightExperience(enemyLvl: number, playerLevel: number, rank: TargetRank): number {
  const effective = Math.min(enemyLvl, playerLevel + 5);
  const base = (10 * (2 * effective + 4) * CIRCLE_MULTIPLIER_TENTHS[rank]) / 10;
  return Math.round(enemyLvl < playerLevel - 10 ? base / 4 : base);
}

/** Srebro z walki (GDD 10.5): `6 · Lw^1,25 · U(0,8; 1,2) · m_kręgu`; `rollBp` z przedziału 8 000–12 000. */
export function fightSilver(enemyLvl: number, rollBp: number, rank: TargetRank): number {
  return Math.round(
    (6 * pow125(enemyLvl) * rollBp * CIRCLE_MULTIPLIER_TENTHS[rank]) / (10_000 * 10),
  );
}
export const FIGHT_SILVER_ROLL_BP = { min: 8_000, max: 12_000 } as const;

/** Łup przedmiotów z walki (GDD 10.5): 35% szansy. */
export const GEAR_DROP_CHANCE_BP = 3_500;
/** Założenie Etapu 1: śmieci (trofea do sprzedania) wypadają w 50% walk. */
export const JUNK_DROP_CHANCE_BP = 5_000;

// ─── Ekwipunek i klasy (GDD 5.5) ───────────────────────────────────────────

export const ITEM_RARITIES = ['common', 'sturdy', 'rare', 'occult', 'cursed'] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];
/** Rozkład rzadkości łupu (GDD 10.5): 70 / 22 / 6,5 / 1,4 / 0,1%. */
export const RARITY_DROP_WEIGHTS: Record<ItemRarity, number> = {
  common: 7_000,
  sturdy: 2_200,
  rare: 650,
  occult: 140,
  cursed: 10,
};
/** Założenie Etapu 1: mnożnik premii statystyk z rzadkości (Piętna dochodzą później). */
export const RARITY_BONUS_BP: Record<ItemRarity, number> = {
  common: 10_000,
  sturdy: 11_000,
  rare: 12_500,
  occult: 14_000,
  cursed: 16_000,
};
/** Założenie Etapu 1: mnożnik ceny z rzadkości (jak mnożnik Rozkładu 10.6, ale łagodniejszy). */
export const RARITY_PRICE_BP: Record<ItemRarity, number> = {
  common: 10_000,
  sturdy: 15_000,
  rare: 25_000,
  occult: 40_000,
  cursed: 60_000,
};

/** Jakość 80–120% (rozkład trójkątny z modą 95%, GDD 10.5) w punktach bazowych. */
export const QUALITY_BP = { min: 8_000, mode: 9_500, max: 12_000 } as const;

/** Odwrotna dystrybuanta rozkładu trójkątnego; `u` w [0, 1). Wynik w punktach bazowych. */
export function triangularQualityBp(u: number): number {
  const { min, mode, max } = QUALITY_BP;
  const split = (mode - min) / (max - min);
  const value =
    u < split
      ? min + Math.sqrt(u * (max - min) * (mode - min))
      : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  return Math.round(value);
}

export const EQUIPMENT_SLOTS = [
  'weapon',
  'head',
  'torso',
  'legs',
  'hands',
  'feet',
  'accessory',
  'talisman',
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
/** Sloty pancerza liczone do zestawu klasy (broń + 4 z 5). */
export const ARMOR_SLOTS = ['head', 'torso', 'legs', 'hands', 'feet'] as const;
export const CLASS_SET_ARMOR_PIECES = 4;

/** Stopnie 1–10 i wymagany poziom (GDD 5.5); Etap 1: Stopnie 1–3. */
export const TIER_REQUIRED_LEVEL = [1, 5, 10, 18, 26, 35, 45, 55, 65, 75] as const;
export const MAX_TIER_THIS_STAGE = 3;

export function tierRequiredLevel(tier: number): number {
  const level = TIER_REQUIRED_LEVEL[tier - 1];
  if (level === undefined) throw new RangeError(`Nieznany Stopień: ${tier}`);
  return level;
}

/** Założenie Etapu 1: premia statystyk sprzętu rośnie o 20% bazy na Stopień. */
export function gearBonusBp(
  baseBp: number,
  tier: number,
  qualityBp: number,
  rarity: ItemRarity,
): number {
  return Math.round(
    (baseBp * (10 + 2 * (tier - 1)) * qualityBp * RARITY_BONUS_BP[rarity]) / (10 * 10_000 * 10_000),
  );
}

/** Życie ze sprzętu rośnie jak obrażenia broni: ×1,35 na Stopień, z jakością. */
export function gearLife(baseLife: number, tier: number, qualityBp: number): number {
  return Math.round((baseLife * powInt(1.35, tier - 1) * qualityBp) / 10_000);
}

/** Założenie Etapu 1: wartość przedmiotu ×3 na Stopień (broń 80, reszta 50 srebra na Stopniu 1). */
export function gearValue(
  slot: EquipmentSlot,
  tier: number,
  qualityBp: number,
  rarity: ItemRarity,
): number {
  const base = slot === 'weapon' ? 80 : 50;
  return Math.round(
    (base * powInt(3, tier - 1) * qualityBp * RARITY_PRICE_BP[rarity]) / (10_000 * 10_000),
  );
}

/** Sklep odkupuje za 30% wartości (założenie Etapu 1). */
export const SELL_PRICE_BP = 3_000;
export const sellPrice = (value: number) => Math.max(1, applyBp(value, SELL_PRICE_BP));

/** Plecak: limit nienoszonych przedmiotów; nadmiar łupu sprzedaje się od razu. */
export const INVENTORY_CAPACITY = 100;

/** Poziom klasy 0–30 (GDD 10.2): do poziomu n+1 potrzeba `500·n^1,8` (dla n = 0 liczymy jak n = 1). */
export const CLASS_MAX_LEVEL = 30;
export function classExperienceToNext(level: number): number {
  if (level >= CLASS_MAX_LEVEL) return 0;
  return Math.round(500 * Math.max(1, level) ** 1.8);
}

/** Dodaje XP klasy i rozlicza poziomy; nadmiar na poziomie maksymalnym przepada. */
export function grantClassExperience(
  state: { level: number; experience: number },
  amount: number,
): { level: number; experience: number } {
  let { level } = state;
  let experience = state.experience + amount;
  while (level < CLASS_MAX_LEVEL && experience >= classExperienceToNext(level)) {
    experience -= classExperienceToNext(level);
    level++;
  }
  if (level === CLASS_MAX_LEVEL) experience = 0;
  return { level, experience };
}

// ─── Zlecenia (GDD 5.9, 10.1, 10.5) ────────────────────────────────────────

/** Czasy i koszty Zleceń w Wigorze (GDD 10.1): 5 min / 15 min / 1 h / 4 h / 8 h. */
export const MISSION_TIERS = [
  // Wymaganie 7: przy statystykach startowych (20) pierwsze zlecenie jest pewne.
  { id: 'm5', durationMs: 5 * MINUTE_MS, vigorCost: 5, requiredStat: 7 },
  { id: 'm15', durationMs: 15 * MINUTE_MS, vigorCost: 10, requiredStat: 50 },
  { id: 'h1', durationMs: HOUR_MS, vigorCost: 20, requiredStat: 120 },
  { id: 'h4', durationMs: 4 * HOUR_MS, vigorCost: 35, requiredStat: 300 },
  { id: 'h8', durationMs: 8 * HOUR_MS, vigorCost: 50, requiredStat: 600 },
] as const;
export type MissionTierId = (typeof MISSION_TIERS)[number]['id'];

export function missionTier(id: MissionTierId) {
  const tier = MISSION_TIERS.find((candidate) => candidate.id === id);
  if (!tier) throw new RangeError(`Nieznany czas zlecenia: ${id}`);
  return tier;
}

/** Pętla do 11 powtórzeń, potem pauza (GDD 5.9). */
export const MISSION_MAX_LOOPS = 11;
/** Biegłość = liczba sukcesów (maks. 20). */
export const MISSION_MAX_MASTERY = 20;

/** XP za zlecenie (GDD 10.2): `W · (2·L + 4) · 1,2 · (1 + 0,4·P)`. */
export function missionExperience(vigorCost: number, level: number, deepening = 0): number {
  return Math.round((vigorCost * (2 * level + 4) * 12 * (10 + 4 * deepening)) / 100);
}

/** Srebro za zlecenie (GDD 10.5): `W · 0,5 · L^1,25 · (1 + 0,4·P)`. */
export function missionSilver(vigorCost: number, level: number, deepening = 0): number {
  return Math.round((vigorCost * pow125(level) * (10 + 4 * deepening)) / 20);
}

/**
 * Szansa zlecenia (GDD 10.5) w punktach bazowych:
 * `p = clamp(0,05; 1,0; 0,55 + 0,02·biegłość + 0,25·(S_ef / S_wym − 1))`.
 */
export function missionChanceBp(mastery: number, effectiveStat: number, requiredStat: number) {
  const m = Math.min(MISSION_MAX_MASTERY, Math.max(0, mastery));
  const statTerm = Math.round(2_500 * (effectiveStat / requiredStat - 1));
  return Math.min(10_000, Math.max(500, 5_500 + 200 * m + statTerm));
}

/** Porażka zlecenia (GDD 10.5): −U(30%; 50%) max Życia; Zakon dodatkowo −U(3; 10) Poczytalności. */
export const MISSION_FAILURE_LIFE_BP = { min: 3_000, max: 5_000 } as const;
export const MISSION_FAILURE_SANITY = { min: 3, max: 10 } as const;

// ─── Przytułek, Poczytalność, Sanatorium (GDD 4.3, 5.22, 6.1, 10.1, 10.7) ──

/** Przytułek po śmierci: `10 + 0,5·L` min (maks. 50); śmierć od Grozy ≥ 8: ×1,5. */
export function hospitalDurationMs(level: number, enemyDread = 0): number {
  const base = Math.min(50 * MINUTE_MS, 10 * MINUTE_MS + (level * MINUTE_MS) / 2);
  return enemyDread >= 8 ? (base * 3) / 2 : base;
}
/** Porażka zlecenia z Życiem 0: Przytułek na 10 min (GDD 5.9). */
export const MISSION_DEATH_HOSPITAL_MS = 10 * MINUTE_MS;

/** Szabrownicy: po śmierci w Łowach znika 10% noszonego srebra (GDD 5.15). */
export const LOOTERS_SHARE_BP = 1_000;
export const lootersLoss = (carriedSilver: number) => applyBp(carriedSilver, LOOTERS_SHARE_BP);

/** Groza na starcie walki (GDD 10.7): `ΔP = round(4 · G · 100 / (100 + Opanowanie))`. */
export const dreadSanityLoss = (dread: number, composure = 0) =>
  Math.round((4 * dread * 100) / (100 + composure));
/** *Spojrzenie* w walce: `2 · G` z tym samym mnożnikiem. */
export const gazeSanityLoss = (dread: number, composure = 0) =>
  Math.round((2 * dread * 100) / (100 + composure));
/** Założenie Etapu 1: Spojrzenie pada w 3. rundzie (zamiast zwykłego ataku). */
export const GAZE_ROUND = 3;

export const SANITY_TIERS = ['calm', 'uneasy', 'shaken', 'broken'] as const;
export type SanityTier = (typeof SANITY_TIERS)[number];

/**
 * Progi Poczytalności (GDD 6.1) w procentach maksimum: Spokój 100–61, Niepokój 60–31,
 * Rozchwianie 30–1 (Krawędź 10–1 dochodzi później — w Etapie 1 działa jak Rozchwianie), 0 = Załamanie.
 */
export function sanityTier(value: number, max: number): SanityTier {
  if (value <= 0) return 'broken';
  const percent = Math.floor((100 * value) / max);
  if (percent > 60) return 'calm';
  if (percent > 30) return 'uneasy';
  return 'shaken';
}

/** Efekty mechaniczne progów (GDD 6.1). */
export const SANITY_EFFECTS: Record<
  SanityTier,
  { accuracyPenaltyBp: number; critBonusBp: number; panicBp: number }
> = {
  calm: { accuracyPenaltyBp: 0, critBonusBp: 0, panicBp: 0 },
  uneasy: { accuracyPenaltyBp: 300, critBonusBp: 0, panicBp: 0 },
  shaken: { accuracyPenaltyBp: 800, critBonusBp: 1_000, panicBp: 500 },
  broken: { accuracyPenaltyBp: 800, critBonusBp: 1_000, panicBp: 500 },
};

/** Załamanie: Sanatorium 30–120 min (GDD 4.3). Założenie Etapu 1: `30 + 2·L` min. */
export const breakdownDurationMs = (level: number) => Math.min(120, 30 + 2 * level) * MINUTE_MS;
/** Założenie Etapu 1: wyjście z Sanatorium przywraca Poczytalność do 30% maksimum. */
export const BREAKDOWN_EXIT_SANITY_BP = 3_000;

/** Sanatorium: sesja 30 min = +20 Poczytalności za `30·L^1,1` srebra (GDD 5.22). */
export const SANATORIUM_SESSION_MS = 30 * MINUTE_MS;
export const SANATORIUM_SESSION_SANITY = 20;
export const sanatoriumSessionCost = (level: number) => Math.round(30 * level ** 1.1);
/** Terapia (natychmiastowe wyjście z Załamania): cena sesji za każde rozpoczęte 30 min pobytu. */
export const sanatoriumTreatmentCost = (level: number, remainingMs: number) =>
  sanatoriumSessionCost(level) * Math.max(1, Math.ceil(remainingMs / SANATORIUM_SESSION_MS));

/** Uzależnienie (GDD 10.1): mikstura +2 h, laudanum +4 h; limit 24 h. */
export const ADDICTION_LIMIT_MS = 24 * HOUR_MS;

// ─── Konsumpcja (GDD 4.2, 5.22, 6.1) ───────────────────────────────────────

/** Mikstura lecznicza (założenie Etapu 1): +30% max Życia; w Przytułku skraca pobyt o 15 min. */
export const POTION_HEAL_BP = 3_000;
export const POTION_HOSPITAL_REDUCTION_MS = 15 * MINUTE_MS;
export const POTION_ADDICTION_MS = 2 * HOUR_MS;
/** Laudanum (GDD 6.1): +15 Poczytalności, +4 h Uzależnienia. */
export const LAUDANUM_SANITY = 15;
export const LAUDANUM_ADDICTION_MS = 4 * HOUR_MS;
/** Kawa z Kresu (założenie Etapu 1): +20 Wigoru, może przekroczyć limit. */
export const COFFEE_VIGOR = 20;

// ─── Kasa (GDD 5.15, 10.10) ────────────────────────────────────────────────

/** Opłata 1% od wpłaty (zaokrąglana w górę — ujście srebra). */
export const bankDepositFee = (amount: number) => Math.ceil(amount / 100);

// ─── Codzienność (GDD 5.24) ────────────────────────────────────────────────

/** Dzienne zadanie: 10% XP do następnego poziomu (maks. 20 000). */
export const dailyTaskExperience = (toNextLevel: number) =>
  Math.min(20_000, Math.floor(toNextLevel / 10));
export const DAILY_TASK_COUNT = 6;
/** Założenie Etapu 1: nagroda dzienna zawiera 2 × Kawa z Kresu (= „40 Wigoru z nagród”, GDD 10). */
export const DAILY_TASK_COFFEE = 2;
export const CALENDAR_LENGTH = 28;
export const CALENDAR_MILESTONES = [7, 14, 21, 28] as const;

/** Dzień kalendarzowy UTC (`RRRR-MM-DD`) — granica doby gry to 00:00 UTC (GDD 9.3). */
export const utcDay = (epochMs: number) => new Date(epochMs).toISOString().slice(0, 10);
/** Początek następnej doby UTC. */
export const nextUtcMidnight = (epochMs: number) => (Math.floor(epochMs / DAY_MS) + 1) * DAY_MS;
