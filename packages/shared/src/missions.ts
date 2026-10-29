/**
 * Rozstrzyganie zlecenia — czysta funkcja ziarna zapisanego przy starcie (GDD 8.3, 10.5).
 * Szansa, poziom i maksimum Życia są migawką z chwili startu (w payloadzie aktywności),
 * więc wynik nie zależy od tego, co gracz zrobi, zanim wróci po nagrodę.
 */
import {
  BALANCE_VERSION,
  MISSION_FAILURE_LIFE_BP,
  MISSION_FAILURE_SANITY,
  missionExperience,
  missionSilver,
  missionTier,
} from './balance.js';
import type { MissionDef } from './data/missions.js';
import { createRng } from './rng.js';

export interface MissionResolution {
  mission: MissionDef;
  level: number;
  seed: string;
  /** Szansa sukcesu w punktach bazowych, policzona przy starcie. */
  chanceBp: number;
  maxLife: number;
}

export interface MissionResult {
  balanceVersion: number;
  success: boolean;
  experience: number;
  silver: number;
  /** Utrata Życia przy porażce (30–50% maksimum). */
  lifeLoss: number;
  /** Utrata Poczytalności; tylko zlecenia Zakonu. */
  sanityLoss: number;
  outcome: string;
}

export function resolveMission(input: MissionResolution): MissionResult {
  const tier = missionTier(input.mission.tierId);
  const rng = createRng(input.seed);
  const success = rng.rollBp(input.chanceBp);
  const texts = success ? input.mission.successTexts : input.mission.failureTexts;
  const outcome = rng.pickWeighted(texts.map((text) => ({ item: text, weight: 1 })));
  if (success) {
    return {
      balanceVersion: BALANCE_VERSION,
      success: true,
      experience: missionExperience(tier.vigorCost, input.level),
      silver: missionSilver(tier.vigorCost, input.level),
      lifeLoss: 0,
      sanityLoss: 0,
      outcome,
    };
  }
  return {
    balanceVersion: BALANCE_VERSION,
    success: false,
    experience: 0,
    silver: 0,
    lifeLoss: Math.round(
      (input.maxLife * rng.nextInt(MISSION_FAILURE_LIFE_BP.min, MISSION_FAILURE_LIFE_BP.max)) /
        10_000,
    ),
    sanityLoss:
      input.mission.kind === 'order'
        ? rng.nextInt(MISSION_FAILURE_SANITY.min, MISSION_FAILURE_SANITY.max)
        : 0,
    outcome,
  };
}
