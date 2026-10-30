/**
 * Portal Bogów, Pęk Kluczy, Studnia i Seanse (GDD 5.10, 5.12, 10.8, 10.13).
 *
 * Liczby tego etapu. Zmiana wymaga podniesienia `BALANCE_VERSION` w `balance.ts`.
 * Potęgi niecałkowite zaokrąglamy od razu albo zostawiamy w funkcji piętra, którą
 * testy porównują z tabelą 10.13 (tabela podaje f zaokrąglone, wzór jest ciągły).
 */
import { HOUR_MS, pow125 } from './balance.js';
import { createRng, type Rng } from './rng.js';

export const PORTAL_DOMAINS_THIS_STAGE = 8;
/** ★1–★5 są w tym etapie tylko dla Domen 1–3. Domena 4 ma na razie sam Sen. */
export const PORTAL_STAR_DOMAINS_THIS_STAGE = 3;
export const PORTAL_STARS_MAX = 5;
export const PORTAL_STAGES = 10;
export const PORTAL_SUBSTAGES = 8;
export const PORTAL_FIGHTS_PER_DOMAIN = PORTAL_STAGES * PORTAL_SUBSTAGES;

/** Pęk Kluczy: 1 Klucz Snu / 4 h, maks. 6. Klucze z łupu nie mają limitu (GDD 5.12.5). */
export const KEY_REGEN_INTERVAL_MS = 4 * HOUR_MS;
export const KEY_RING_CAP = 6;
export const KEY_SHARDS_PER_KEY = 5;

/** Wygrana: 15% na Odłamek Klucza. Porażka: zawsze 1 Odłamek (1/5 klucza). */
export const PORTAL_WIN_SHARD_CHANCE_BP = 1_500;
export const PORTAL_LOSS_SHARDS = 1;

/** Grawer Kluczy: maks. 3 dziennie, 2 Odłamki Meteorytu (GDD 5.12.5). */
export const ENGRAVER_DAILY_CAP = 3;
export const ENGRAVER_METEOR_COST = 2;

/** Studnia w tym etapie: piętra 1–100. Bezdeń (po 100) jest w Etapie 9. */
export const WELL_MAX_FLOOR_THIS_STAGE = 100;
/** Od piętra 50 każda walka +0,2 Skażenia (2 dziesiąte). Od 70 Groza ≥ 6 (GDD 5.10). */
export const WELL_CONTAMINATION_FLOOR = 50;
export const WELL_DREAD_FLOOR = 70;
export const WELL_DEEP_TENTHS = 2;
export const WELL_DEEP_DREAD = 6;
export const WELL_VIGOR_COST = 10;
export const WELL_GUARDIAN_EVERY = 10;
export const WELL_GUARDIAN_KEYS = 2;
/**
 * Założenie Etapu 2: pierwsze zabicie Strażnika daje też 2 Odłamki Meteorytu.
 * Właściwe źródło (Domena Koloru) wchodzi w Etapie 3; bez tego Grawer nie ma składnika.
 */
export const WELL_GUARDIAN_METEORS = 2;
export const WELL_WHISPER_EVERY = 5;

/** Seans: zwykła Świeca. Nowa postać dostaje 3 — Warsztaty (świece) są dopiero w Etapie 5. */
export const STARTING_CANDLES = 3;
export const SEANCE_ECHO_WEIGHT = 25;
export const SEANCE_GEAR_WEIGHT = 45;
export const SEANCE_CONSUMABLE_WEIGHT = 30;

/** Szanse rzadkości, gdy wynik Seansu to Echo (GDD 10.8), w dziesiątych procenta. */
export const ECHO_RARITY_WEIGHTS = {
  whisper: 620,
  apparition: 270,
  wraith: 85,
  phantom: 23,
  beyond: 2,
} as const;

export const ECHO_RARITIES = ['whisper', 'apparition', 'wraith', 'phantom', 'beyond'] as const;
export type EchoRarity = (typeof ECHO_RARITIES)[number];

/** Bonus bazowy do sumy statystyk (GDD 10.8). */
export const ECHO_STAT_BONUS = {
  whisper: 0.04,
  apparition: 0.07,
  wraith: 0.11,
  phantom: 0.16,
  beyond: 0.22,
} as const;

/** Litość: od 60. Seansu bez Widma+ +3 p.p. za każdy kolejny; 80. gwarantuje Widmo+. */
export const SEANCE_PITY_START = 60;
export const SEANCE_PITY_STEP_PP = 3;
export const SEANCE_PITY_GUARANTEE = 80;
/** Osobna litość Spoza Gwiazd (GDD 10.8). */
export const SEANCE_BEYOND_PITY = 300;

export const ECHO_MAX_LEVEL = 10;

/** Łowy: nazwani z Kręgu V i wyżej (numer ≤ 5) — 10% na Odłamek (GDD 5.12.5). */
export const HUNT_SHARD_CIRCLE = 5;
export const HUNT_SHARD_CHANCE_BP = 1_000;

export type PortalRole = 'minion' | 'boss' | 'avatar';
export type PortalModifier =
  | 'ib-vengeance'
  | 'pressure'
  | 'drain'
  | 'pulse'
  | 'judgment'
  | 'yellow-sign'
  | 'fertility'
  | 'rlyeh-dreams';

export interface PortalCoord {
  domain: number;
  stage: number;
  substage: number;
}

/** `g = 80·(k−1) + 8·(e−1) + p` (GDD 10.13). */
export function portalFightIndex(coord: PortalCoord): number {
  return (
    PORTAL_FIGHTS_PER_DOMAIN * (coord.domain - 1) +
    PORTAL_SUBSTAGES * (coord.stage - 1) +
    coord.substage
  );
}

/** `f(g) = 0,126 · g^1,156 + 1`. */
export function portalEquivalentFloor(index: number): number {
  return 0.126 * index ** 1.156 + 1;
}

export function portalRole(stage: number, substage: number): PortalRole {
  if (substage !== PORTAL_SUBSTAGES) return 'minion';
  return stage === PORTAL_STAGES ? 'avatar' : 'boss';
}

/** ★n: statystyki ×1,5ⁿ, Życie i obrażenia ×1,25ⁿ (GDD 10.13). */
export const starStatMultiplier = (stars: number) => 1.5 ** stars;
export const starVitalMultiplier = (stars: number) => 1.25 ** stars;

/** Statystyka walki przy danym f (GDD 10.13). `f` może być ułamkowe. */
export function portalEnemyStat(floor: number, role: PortalRole = 'minion', stars = 0): number {
  const base = 15 * floor ** 1.8 + 10;
  const bonus = role === 'avatar' ? 1.3 : role === 'boss' ? 1.15 : 1;
  return Math.round(base * bonus * starStatMultiplier(stars));
}

export function portalEnemyLife(floor: number, role: PortalRole = 'minion', stars = 0): number {
  const base = 60 + 20 * floor;
  const bonus = role === 'avatar' ? 2 : role === 'boss' ? 1.5 : 1;
  return Math.round(base * bonus * starVitalMultiplier(stars));
}

export function portalEnemyDamage(floor: number, role: PortalRole = 'minion', stars = 0): number {
  const base = 8 + 1.2 * floor;
  const bonus = role === 'avatar' ? 1.3 : role === 'boss' ? 1.15 : 1;
  return Math.round(base * bonus * starVitalMultiplier(stars));
}

/**
 * Zalecany poziom podetapu. Domena 1: 7→18, Domena 2: 18→27 (GDD 5.12.2),
 * liniowo po 80 walkach. Dalsze Domeny mają te same rozpiętości z tabeli.
 */
const DOMAIN_LEVELS: readonly (readonly [number, number])[] = [
  [7, 18],
  [18, 27],
  [27, 35],
  [35, 43],
  [43, 49],
  [49, 55],
  [55, 60],
  [60, 66],
  [66, 71],
  [71, 76],
  [76, 80],
];

export function portalRecommendedLevel(coord: PortalCoord): number {
  const span = DOMAIN_LEVELS[coord.domain - 1] ?? DOMAIN_LEVELS[0] ?? [7, 18];
  const index = PORTAL_SUBSTAGES * (coord.stage - 1) + (coord.substage - 1);
  const [start, end] = span;
  return Math.round(start + ((end - start) * index) / (PORTAL_FIGHTS_PER_DOMAIN - 1));
}

/** Groza Aury Domeny: `G = 1,5 + 0,75·k` (GDD 5.12.7). */
export function portalAuraDread(domain: number): number {
  return 1.5 + 0.75 * domain;
}

export function portalModifier(domain: number): PortalModifier | null {
  if (domain === 1) return 'ib-vengeance';
  if (domain === 2) return 'pressure';
  if (domain === 3) return 'drain';
  if (domain === 4) return 'pulse';
  if (domain === 5) return 'judgment';
  if (domain === 6) return 'yellow-sign';
  if (domain === 7) return 'fertility';
  if (domain === 8) return 'rlyeh-dreams';
  return null;
}

/**
 * Sigil Boga otwiera etapy 6–10 Domen 3+ oraz wszystkie ★ (GDD 5.12.5).
 * Domeny 1–2 i etapy 1–5 biorą Klucz Snu.
 */
export function portalSigilRequired(coord: PortalCoord, stars = 0): boolean {
  if (stars > 0) return true;
  return coord.domain >= 3 && coord.stage >= 6;
}

/** XP podstawy: `10 · (2·L_p + 4)` (GDD 10.13). */
export function portalBaseExperience(level: number): number {
  return 10 * (2 * level + 4);
}

/** Srebro podstawy: `6 · L_p^1,25` (GDD 10.13). */
export function portalBaseSilver(level: number): number {
  return Math.round(6 * pow125(level));
}

/** Grawer: `6·L^1,25` srebra — tyle samo, co srebro podstawy nagrody przy tym poziomie. */
export const engraverSilverCost = portalBaseSilver;

export function portalMaterialCount(domain: number, role: PortalRole, stars = 0): number {
  const base = 1 + Math.floor(domain / 3);
  const roleBonus = role === 'avatar' ? 20 : role === 'boss' ? 5 : 1;
  const starBonus = 1 + 0.5 * stars;
  return Math.round(base * roleBonus * starBonus);
}

export interface PortalPayout {
  experience: number;
  silver: number;
  materials: number;
  /** Odprysk Sigilu za bossa Etapu (także awatara). */
  sigilShards: number;
  /** Sigile następnego boga za pierwsze pokonanie awatara. */
  nextGodSigils: number;
}

/**
 * Nagroda walki (GDD 10.13). Awatar ma mnożnik ×5 zamiast ×2 bossa — to ten sam
 * podetap, nie dwa mnożniki naraz. Etapy 6–10 Domen 3+ dokładają ×1,5.
 */
export function portalPayout(
  coord: PortalCoord,
  firstClear: boolean,
  won: boolean,
  stars = 0,
): PortalPayout {
  const level = portalRecommendedLevel(coord);
  const role = portalRole(coord.stage, coord.substage);
  const baseXp = portalBaseExperience(level);
  if (!won) {
    return {
      experience: Math.round(baseXp * 0.1),
      silver: 0,
      materials: 0,
      sigilShards: 0,
      nextGodSigils: 0,
    };
  }
  let multiplier = 1;
  if (firstClear) multiplier *= 3;
  if (role === 'avatar') multiplier *= 5;
  else if (role === 'boss') multiplier *= 2;
  if (coord.domain >= 3 && coord.stage >= 6) multiplier *= 1.5;
  if (stars > 0) multiplier *= 1 + 0.5 * stars;
  const boss = role === 'boss' || role === 'avatar';
  return {
    experience: Math.round(baseXp * multiplier),
    silver: Math.round(portalBaseSilver(level) * multiplier),
    materials: portalMaterialCount(coord.domain, role, stars),
    sigilShards: boss ? 1 : 0,
    nextGodSigils: firstClear && role === 'avatar' && coord.domain < 11 ? 3 : 0,
  };
}

export interface KeyRing {
  regenKeys: number;
  regenUpdatedAt: number;
  lootKeys: number;
  shards: number;
}

/** Leniwa regeneracja Pęku — ten sam schemat co Wigor (GDD 9.1, 5.12.5). */
export function materializeKeyRing(ring: KeyRing, now: number, cap = KEY_RING_CAP): KeyRing {
  if (now <= ring.regenUpdatedAt) return ring;
  if (ring.regenKeys >= cap) return { ...ring, regenUpdatedAt: now };
  const ticks = Math.floor((now - ring.regenUpdatedAt) / KEY_REGEN_INTERVAL_MS);
  const regenKeys = Math.min(cap, ring.regenKeys + ticks);
  if (regenKeys >= cap) return { ...ring, regenKeys, regenUpdatedAt: now };
  return {
    ...ring,
    regenKeys,
    regenUpdatedAt: ring.regenUpdatedAt + ticks * KEY_REGEN_INTERVAL_MS,
  };
}

export const dreamKeyCount = (ring: KeyRing) => ring.regenKeys + ring.lootKeys;

/** Najpierw klucz z Pęku, żeby limit nie blokował regeneracji. */
export function spendDreamKey(ring: KeyRing): KeyRing | null {
  if (ring.regenKeys > 0) return { ...ring, regenKeys: ring.regenKeys - 1 };
  if (ring.lootKeys > 0) return { ...ring, lootKeys: ring.lootKeys - 1 };
  return null;
}

/** 5 Odłamków → 1 Klucz Snu z łupu, natychmiast (GDD 5.12.5). */
export function addKeyShards(ring: KeyRing, shards: number): KeyRing {
  if (!Number.isSafeInteger(shards) || shards < 0) throw new RangeError('Niepoprawne odłamki');
  const total = ring.shards + shards;
  return {
    ...ring,
    shards: total % KEY_SHARDS_PER_KEY,
    lootKeys: ring.lootKeys + Math.floor(total / KEY_SHARDS_PER_KEY),
  };
}

export function addLootKeys(ring: KeyRing, keys: number): KeyRing {
  return { ...ring, lootKeys: ring.lootKeys + keys };
}

export interface PortalClear {
  domain: number;
  stage: number;
  substage: number;
}

export function nextPortalFight(cleared: PortalClear): PortalCoord {
  if (cleared.domain <= 0 || cleared.substage <= 0) {
    return { domain: 1, stage: 1, substage: 1 };
  }
  if (cleared.substage < PORTAL_SUBSTAGES) {
    return { domain: cleared.domain, stage: cleared.stage, substage: cleared.substage + 1 };
  }
  if (cleared.stage < PORTAL_STAGES) {
    return { domain: cleared.domain, stage: cleared.stage + 1, substage: 1 };
  }
  return { domain: cleared.domain + 1, stage: 1, substage: 1 };
}

export type PortalAccess = 'first' | 'repeat' | 'skip' | 'locked';

function coordValid(coord: PortalCoord): boolean {
  return (
    coord.domain >= 1 &&
    coord.stage >= 1 &&
    coord.stage <= PORTAL_STAGES &&
    coord.substage >= 1 &&
    coord.substage <= PORTAL_SUBSTAGES
  );
}

/** Pierwsze przejście albo powtórka ukończonego podetapu. Pominięcie i Domeny spoza etapu odpadają. */
export function portalAccess(
  requested: PortalCoord,
  cleared: PortalClear,
  maxDomain = PORTAL_DOMAINS_THIS_STAGE,
): PortalAccess {
  if (!coordValid(requested)) return 'skip';
  const next = nextPortalFight(cleared);
  const same =
    requested.domain === next.domain &&
    requested.stage === next.stage &&
    requested.substage === next.substage;
  if (same) return requested.domain > maxDomain ? 'locked' : 'first';
  if (requested.domain > maxDomain) return 'locked';
  if (cleared.domain <= 0) return 'skip';
  if (portalFightIndex(requested) <= portalFightIndex(cleared)) return 'repeat';
  return 'skip';
}

export interface StarTrack {
  /** Ile pełnych ★ tej Domeny już zamknięto. */
  cleared: number;
  stage: number;
  substage: number;
}

export const emptyStarTrack = (): StarTrack => ({ cleared: 0, stage: 0, substage: 0 });

/** Sen Domeny jest skończony, gdy awatar padł albo gracz jest już dalej. */
export function domainDreamCleared(dream: PortalClear, domain: number): boolean {
  if (dream.domain > domain) return true;
  return (
    dream.domain === domain && dream.stage === PORTAL_STAGES && dream.substage === PORTAL_SUBSTAGES
  );
}

/**
 * ★n otwiera się po ★(n−1), a ★1 po awatarze Snu. Pominięcie podetapu odpada
 * tak samo jak w Śnie.
 */
export function portalStarAccess(
  requested: PortalCoord,
  stars: number,
  dream: PortalClear,
  track: StarTrack,
  maxDomain = PORTAL_STAR_DOMAINS_THIS_STAGE,
): PortalAccess {
  if (!coordValid(requested) || stars < 1 || stars > PORTAL_STARS_MAX) return 'skip';
  if (requested.domain > maxDomain) return 'locked';
  if (!domainDreamCleared(dream, requested.domain)) return 'locked';
  if (stars > track.cleared + 1) return 'locked';
  if (stars <= track.cleared) return 'repeat';
  const cleared: PortalClear = {
    domain: requested.domain,
    stage: track.stage,
    substage: track.substage,
  };
  const next =
    track.stage <= 0
      ? { domain: requested.domain, stage: 1, substage: 1 }
      : nextPortalFight(cleared);
  if (
    requested.domain === next.domain &&
    requested.stage === next.stage &&
    requested.substage === next.substage
  ) {
    return 'first';
  }
  if (track.stage > 0 && portalFightIndex(requested) <= portalFightIndex(cleared)) return 'repeat';
  return 'skip';
}

/** Bogowie, których Sigil można już przekuć: bieżąca Domena i wszystkie skończone. */
export function unlockedPortalGods(
  dream: PortalClear,
  maxDomain = PORTAL_DOMAINS_THIS_STAGE,
): number[] {
  let highest = 1;
  for (let domain = 1; domain < maxDomain; domain += 1) {
    if (domainDreamCleared(dream, domain)) highest = domain + 1;
  }
  if (dream.domain > highest) highest = Math.min(maxDomain, dream.domain);
  return Array.from({ length: Math.min(maxDomain, highest) }, (_, index) => index + 1);
}

/** Zlecenie ≥ 1 h: 20% na Odłamek; 8 h: 1 Odłamek (GDD 5.12.5). Tylko sukces. */
export function missionKeyShards(tierId: string, success: boolean, hit: boolean): number {
  if (!success) return 0;
  if (tierId === 'h8') return 1;
  if ((tierId === 'h1' || tierId === 'h4') && hit) return 1;
  return 0;
}

export function huntKeyShard(circle: number, named: boolean, hit: boolean): number {
  return named && circle <= HUNT_SHARD_CIRCLE && hit ? 1 : 0;
}

export function isWellGuardian(floor: number): boolean {
  return floor > 0 && floor % WELL_GUARDIAN_EVERY === 0;
}

export function wellContaminationTenths(floor: number): number {
  return floor >= WELL_CONTAMINATION_FLOOR ? WELL_DEEP_TENTHS : 0;
}

/** Szept „cisza” zeruje Grozę także poniżej progu 70. */
export function wellFightDread(floor: number, guardian: boolean, hush: boolean): number {
  if (hush) return 0;
  const base = guardian ? 4 : 1;
  return floor >= WELL_DREAD_FLOOR ? Math.max(base, WELL_DEEP_DREAD) : base;
}

/** Po piętrach 5, 10, … trzeba wybrać Szept, zanim zejdziesz niżej. */
export function wellWhisperPending(floorCleared: number, whisperUntilFloor: number): boolean {
  if (floorCleared <= 0 || floorCleared >= WELL_MAX_FLOOR_THIS_STAGE) return false;
  if (floorCleared % WELL_WHISPER_EVERY !== 0) return false;
  return whisperUntilFloor < floorCleared + WELL_WHISPER_EVERY;
}

export const WELL_WHISPERS = ['plunder', 'hush', 'tide'] as const;
export type WellWhisper = (typeof WELL_WHISPERS)[number];

/** Mnożnik statystyki Echa: bonus × `(1 + 0,12·(poziom−1))` (GDD 10.8). */
export function echoStatMultiplier(rarity: EchoRarity, level: number): number {
  const bonus = ECHO_STAT_BONUS[rarity];
  const clamped = Math.min(ECHO_MAX_LEVEL, Math.max(1, level));
  return 1 + bonus * (1 + 0.12 * (clamped - 1));
}

/** Koszt przejścia z poziomu n na n+1: n odłamków (GDD 10.8). */
export const echoUpgradeCost = (level: number) => level;

export type SeanceOutcome = 'echo' | 'gear' | 'consumable';

export interface SeanceRoll {
  outcome: SeanceOutcome;
  rarity: EchoRarity | null;
  /** Sucha passa bez Widma+ PO tym Seansie. */
  dry: number;
  /** Sucha passa bez Spoza Gwiazd PO tym Seansie. */
  beyondDry: number;
}

function rarityWeights(dryBefore: number): Record<EchoRarity, number> {
  const weights: Record<EchoRarity, number> = { ...ECHO_RARITY_WEIGHTS };
  const attempt = dryBefore + 1;
  if (attempt >= SEANCE_PITY_START && attempt < SEANCE_PITY_GUARANTEE) {
    const bonus = (attempt - (SEANCE_PITY_START - 1)) * SEANCE_PITY_STEP_PP * 10;
    weights.phantom += bonus;
    weights.whisper = Math.max(0, weights.whisper - bonus);
  }
  return weights;
}

/**
 * Jeden Seans. `dryBefore` to liczba poprzednich Seansów bez Widma+.
 * Rozkład bazowy (sucha passa 0) jest tym z GDD 10.8 — test chi-kwadrat go pilnuje.
 */
export function rollSeance(rng: Rng, dryBefore: number, beyondDryBefore: number): SeanceRoll {
  const outcome = rng.pickWeighted<SeanceOutcome>([
    { item: 'echo', weight: SEANCE_ECHO_WEIGHT },
    { item: 'gear', weight: SEANCE_GEAR_WEIGHT },
    { item: 'consumable', weight: SEANCE_CONSUMABLE_WEIGHT },
  ]);
  if (outcome !== 'echo') {
    return { outcome, rarity: null, dry: dryBefore + 1, beyondDry: beyondDryBefore + 1 };
  }
  const attempt = dryBefore + 1;
  const beyondAttempt = beyondDryBefore + 1;
  let rarity: EchoRarity;
  if (beyondAttempt >= SEANCE_BEYOND_PITY) {
    rarity = 'beyond';
  } else if (attempt >= SEANCE_PITY_GUARANTEE) {
    rarity = rng.pickWeighted<EchoRarity>([
      { item: 'phantom', weight: ECHO_RARITY_WEIGHTS.phantom },
      { item: 'beyond', weight: ECHO_RARITY_WEIGHTS.beyond },
    ]);
  } else {
    const weights = rarityWeights(dryBefore);
    rarity = rng.pickWeighted(ECHO_RARITIES.map((item) => ({ item, weight: weights[item] })));
  }
  const wraithOrBetter = rarity === 'phantom' || rarity === 'beyond';
  return {
    outcome,
    rarity,
    dry: wraithOrBetter ? 0 : dryBefore + 1,
    beyondDry: rarity === 'beyond' ? 0 : beyondDryBefore + 1,
  };
}

export function rollSeanceFromSeed(
  seed: string,
  dryBefore: number,
  beyondDryBefore: number,
): SeanceRoll {
  return rollSeance(createRng(seed), dryBefore, beyondDryBefore);
}
