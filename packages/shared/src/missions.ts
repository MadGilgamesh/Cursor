/**
 * Rozstrzyganie zlecenia — czysta funkcja ziarna zapisanego przy starcie aktywności
 * (GDD 8.3). Serwer liczy nią wynik raz i zapisuje; ten sam seed zawsze daje ten
 * sam wynik, więc wielokrotne kliknięcia i powtórki nie zmieniają nagrody.
 */
import { BALANCE_VERSION, missionExperience, missionSilver, missionTier } from './balance.js';
import type { MissionDef } from './data/missions.js';
import { createRng } from './rng.js';

export interface MissionResult {
  balanceVersion: number;
  experience: number;
  silver: number;
  outcome: string;
}

export function resolveMission(mission: MissionDef, level: number, seed: string): MissionResult {
  const tier = missionTier(mission.tierId);
  const rng = createRng(seed);
  const outcome = rng.pickWeighted(
    mission.outcomes.map((candidate) => ({ item: candidate.text, weight: candidate.weight })),
  );
  return {
    balanceVersion: BALANCE_VERSION,
    experience: missionExperience(tier.vigorCost, level),
    silver: missionSilver(tier.vigorCost, level),
    outcome,
  };
}
