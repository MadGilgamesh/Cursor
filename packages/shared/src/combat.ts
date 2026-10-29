/**
 * Silnik walki (GDD 5.3, 10.4) — czysta funkcja ziarna. Serwer losuje ziarno
 * (CSPRNG), rozstrzyga walkę raz i zapisuje pełny dziennik rund; klient tylko go
 * odtwarza. Te same wejścia i ziarno zawsze dają ten sam dziennik.
 */
import {
  BALANCE_VERSION,
  CLASS_PENETRATION,
  CLASS_UNIQUES,
  COMBAT_ENGINE_VERSION,
  COMBAT_MAX_ROUNDS,
  CRIT_CHANCE_BP,
  CRIT_MULTIPLIER,
  type ClassId,
  DAMAGE_VARIANCE_BP,
  GAZE_ROUND,
  NAMED_STAT_BONUS_BP,
  SANITY_EFFECTS,
  type SanityTier,
  damageRatio,
  dreadSanityLoss,
  enemyDamage,
  enemyLevel,
  enemyLife,
  enemyStat,
  gazeSanityLoss,
  hitChance,
  sanityTier,
} from './balance.js';
import type { StatBlock } from './character.js';
import type { EnemyDef } from './data/enemies.js';
import { TUTORIAL_ENEMY_STATS } from './data/enemies.js';
import type { PortalModifier } from './portal.js';
import { createRng, type Rng } from './rng.js';

export interface PlayerCombatant {
  level: number;
  /** Statystyki efektywne w punktach (mogą mieć część ułamkową). */
  stats: StatBlock;
  life: number;
  maxLife: number;
  sanity: number;
  maxSanity: number;
  classId: ClassId | null;
  /** `D_broni` z poziomem klasy (GDD 10.4). */
  weaponDamage: number;
  knowledge: number;
  /** Opanowanie z Kaplicy. Bez pola walka liczy się jak przy 0 — dziennik Etapu 1 zostaje. */
  composure?: number;
  /** Blizna „Pustka w Oczach” znosi Panikę. */
  panicImmune?: boolean;
}

export interface EnemyCombatant {
  stats: StatBlock;
  life: number;
  damage: number;
  dread: number;
  gaze: boolean;
}

export const COMBAT_EVENT_KINDS = [
  'dread',
  'hit',
  'crit',
  'miss',
  'panic',
  'gaze',
  'heal',
  'drain',
] as const;
export type CombatEventKind = (typeof COMBAT_EVENT_KINDS)[number];

export interface CombatEvent {
  round: number;
  actor: 'player' | 'enemy';
  kind: CombatEventKind;
  damage: number;
  /** Okultysta: cios wzmocniony *Słowem*. */
  word: boolean;
  /** Rzeźnik: cios w *Krwawym szale*. */
  frenzy: boolean;
  playerLife: number;
  enemyLife: number;
  sanity: number;
}

export interface CombatResult {
  engineVersion: number;
  balanceVersion: number;
  winner: 'player' | 'enemy';
  timeout: boolean;
  rounds: number;
  playerFirst: boolean;
  playerLifeStart: number;
  playerLifeEnd: number;
  enemyLifeStart: number;
  enemyLifeEnd: number;
  sanityStart: number;
  sanityEnd: number;
  events: CombatEvent[];
}

const BP = 10_000;

function rollChance(rng: Rng, chance: number): boolean {
  return rng.rollBp(Math.round(chance * BP));
}

function variance(rng: Rng): number {
  return rng.nextInt(DAMAGE_VARIANCE_BP.min, DAMAGE_VARIANCE_BP.max) / BP;
}

/**
 * `modifier` to reguła Domeny (GDD 5.12.3). Bez niego walka jest taka jak w Łowach —
 * te same ziarno i wejścia dają ten sam dziennik.
 * - `ib-vengeance`: co 4. rundę wróg leczy 5% Życia początkowego.
 * - `pressure`: Unik gracza −10%, a od 5. rundy dodatkowe −2% za rundę.
 * - `drain`: co rundę −2% maksimum Życia i −1 Poczytalności (Kolor).
 */
export function simulateCombat(
  player: PlayerCombatant,
  enemy: EnemyCombatant,
  seed: string,
  modifier?: PortalModifier,
): CombatResult {
  const rng = createRng(seed);
  const penetration = CLASS_PENETRATION[player.classId ?? 'none'];
  const kDefense = penetration.kDefenseBp / BP;
  const kEvasion = penetration.kEvasionBp / BP;
  const events: CombatEvent[] = [];

  let playerLife = player.life;
  let enemyLifeLeft = enemy.life;
  let sanity = player.sanity;
  let wordUsed = false;

  const push = (event: Omit<CombatEvent, 'playerLife' | 'enemyLife' | 'sanity'>) => {
    events.push({ ...event, playerLife, enemyLife: enemyLifeLeft, sanity });
  };

  const dreadLoss = Math.min(sanity, dreadSanityLoss(enemy.dread, player.composure ?? 0));
  if (dreadLoss > 0) {
    sanity -= dreadLoss;
    push({
      round: 0,
      actor: 'enemy',
      kind: 'dread',
      damage: dreadLoss,
      word: false,
      frenzy: false,
    });
  }

  const tierNow = (): SanityTier => sanityTier(sanity, player.maxSanity);

  const playerAttack = (round: number) => {
    const effects = SANITY_EFFECTS[tierNow()];
    if (!player.panicImmune && rng.rollBp(effects.panicBp)) {
      push({ round, actor: 'player', kind: 'panic', damage: 0, word: false, frenzy: false });
      return;
    }
    const guaranteed = player.classId === 'marksman' && round === 1;
    const chance = Math.max(
      0.05,
      hitChance(player.stats.accuracy, enemy.stats.evasion, kEvasion) -
        effects.accuracyPenaltyBp / BP,
    );
    if (!guaranteed && !rollChance(rng, chance)) {
      push({ round, actor: 'player', kind: 'miss', damage: 0, word: false, frenzy: false });
      return;
    }
    const frenzy =
      player.classId === 'butcher' &&
      playerLife * BP < player.maxLife * CLASS_UNIQUES.butcherFrenzyLifeBp;
    const strength = frenzy
      ? player.stats.strength * (1 + CLASS_UNIQUES.butcherFrenzyStrengthBp / BP)
      : player.stats.strength;
    const ratio = damageRatio(strength, enemy.stats.defense, kDefense);
    const crit = rng.rollBp(CRIT_CHANCE_BP + effects.critBonusBp);
    const word = player.classId === 'occultist' && !wordUsed;
    if (word) wordUsed = true;
    const wordMultiplier = word
      ? CLASS_UNIQUES.occultistWordBase + CLASS_UNIQUES.occultistWordPerKnowledge * player.knowledge
      : 1;
    const raw =
      (player.weaponDamage + 2 * player.level) *
      ratio *
      variance(rng) *
      (crit ? CRIT_MULTIPLIER : 1) *
      wordMultiplier;
    const damage = Math.max(1, Math.round(raw));
    enemyLifeLeft = Math.max(0, enemyLifeLeft - damage);
    push({ round, actor: 'player', kind: crit ? 'crit' : 'hit', damage, word, frenzy });
  };

  const playerEvasion = (round: number) => {
    if (modifier !== 'pressure') return player.stats.evasion;
    const extra = round >= 5 ? (round - 4) * 0.02 : 0;
    return player.stats.evasion * Math.max(0, 1 - 0.1 - extra);
  };

  const enemyAttack = (round: number) => {
    if (enemy.gaze && round === GAZE_ROUND) {
      const loss = Math.min(sanity, gazeSanityLoss(enemy.dread));
      sanity -= loss;
      push({ round, actor: 'enemy', kind: 'gaze', damage: loss, word: false, frenzy: false });
      return;
    }
    if (!rollChance(rng, hitChance(enemy.stats.accuracy, playerEvasion(round)))) {
      push({ round, actor: 'enemy', kind: 'miss', damage: 0, word: false, frenzy: false });
      return;
    }
    const ratio = damageRatio(enemy.stats.strength, player.stats.defense);
    const crit = rng.rollBp(CRIT_CHANCE_BP);
    const raw = enemy.damage * ratio * variance(rng) * (crit ? CRIT_MULTIPLIER : 1);
    const damage = Math.max(1, Math.round(raw));
    playerLife = Math.max(0, playerLife - damage);
    push({
      round,
      actor: 'enemy',
      kind: crit ? 'crit' : 'hit',
      damage,
      word: false,
      frenzy: false,
    });
  };

  // Remis Uniku rozstrzyga się na korzyść obrońcy (NPC), jak brak rozstrzygnięcia.
  const playerFirst = player.stats.evasion > enemy.stats.evasion;
  let rounds = 0;
  for (let round = 1; round <= COMBAT_MAX_ROUNDS; round++) {
    rounds = round;
    if (modifier === 'drain' && playerLife > 0) {
      const loss = Math.max(1, Math.round(player.maxLife * 0.02));
      playerLife = Math.max(0, playerLife - loss);
      sanity = Math.max(0, sanity - 1);
      push({ round, actor: 'enemy', kind: 'drain', damage: loss, word: false, frenzy: false });
      if (playerLife <= 0) break;
    }
    if (modifier === 'ib-vengeance' && round % 4 === 0 && enemyLifeLeft > 0) {
      const heal = Math.max(1, Math.round(enemy.life * 0.05));
      enemyLifeLeft = Math.min(enemy.life, enemyLifeLeft + heal);
      push({ round, actor: 'enemy', kind: 'heal', damage: heal, word: false, frenzy: false });
    }
    if (playerFirst) {
      playerAttack(round);
      if (enemyLifeLeft <= 0) break;
      enemyAttack(round);
      if (playerLife <= 0) break;
    } else {
      enemyAttack(round);
      if (playerLife <= 0) break;
      playerAttack(round);
      if (enemyLifeLeft <= 0) break;
    }
  }

  const playerWon = enemyLifeLeft <= 0 && playerLife > 0;
  return {
    engineVersion: COMBAT_ENGINE_VERSION,
    balanceVersion: BALANCE_VERSION,
    winner: playerWon ? 'player' : 'enemy',
    timeout: enemyLifeLeft > 0 && playerLife > 0,
    rounds,
    playerFirst,
    playerLifeStart: player.life,
    playerLifeEnd: playerLife,
    enemyLifeStart: enemy.life,
    enemyLifeEnd: enemyLifeLeft,
    sanityStart: player.sanity,
    sanityEnd: sanity,
    events,
  };
}

export interface EnemyAtFloor extends EnemyCombatant {
  floor: number;
  level: number;
}

/** Wróg na danym piętrze (GDD 10.4); nazwani +10% statystyk. */
export function enemyAtFloor(def: EnemyDef, floor: number): EnemyAtFloor {
  const base = enemyStat(floor);
  const stat = def.named ? Math.round((base * (BP + NAMED_STAT_BONUS_BP)) / BP) : base;
  return {
    floor,
    level: enemyLevel(floor),
    stats: { strength: stat, defense: stat, accuracy: stat, evasion: stat },
    life: enemyLife(floor),
    damage: enemyDamage(floor),
    dread: def.dread,
    gaze: def.gaze,
  };
}

export function tutorialEnemy(): EnemyAtFloor {
  const s = TUTORIAL_ENEMY_STATS;
  return {
    floor: 0,
    level: s.level,
    stats: { strength: s.strength, defense: s.defense, accuracy: s.accuracy, evasion: s.evasion },
    life: s.life,
    damage: s.damage,
    dread: 1,
    gaze: false,
  };
}

/**
 * Szacunek szansy zwycięstwa do etykiety niebezpieczeństwa na tablicy Łowów.
 * Ziarna próbne są jawne i niezależne od ziarna prawdziwej walki, więc podgląd
 * nie zdradza wyniku.
 */
export function estimateWinChance(
  player: PlayerCombatant,
  enemy: EnemyCombatant,
  samples = 24,
  seedPrefix = 'estimate',
): number {
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    if (simulateCombat(player, enemy, `${seedPrefix}:${i}`).winner === 'player') wins++;
  }
  return wins / samples;
}

export const DANGER_LEVELS = ['easy', 'even', 'risky', 'deadly'] as const;
export type DangerLevel = (typeof DANGER_LEVELS)[number];

export function dangerLevel(winChance: number): DangerLevel {
  if (winChance >= 0.85) return 'easy';
  if (winChance >= 0.6) return 'even';
  if (winChance >= 0.3) return 'risky';
  return 'deadly';
}
