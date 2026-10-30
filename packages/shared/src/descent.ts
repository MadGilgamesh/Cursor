/**
 * Zstąpienie i Piętna (GDD 6.6, rozdz. 11 — Etap 10).
 * Szkolenie daje +3% przyrostu za punkt. Mutacja i Konstelacja są licznikami:
 * GDD nie podaje osobnego wzoru poza samym punktem.
 */
import { CHARACTER_MAX_LEVEL } from './progression.js';
import { findMission } from './data/missions.js';
import { resolveMission } from './missions.js';
import { portalBaseExperience, portalBaseSilver } from './portal.js';

export const DESCENT_MIN_LEVEL = 60;
export const DESCENT_MAX = 10;

export const MARKS = ['training', 'mutation', 'constellation'] as const;
export type Mark = (typeof MARKS)[number];

/** +3% przyrostu Fechtowni za każdy punkt Piętna Szkolenia (przykład z GDD 6.6). */
export const MARK_TRAINING_BP = 300;

export function canDescend(level: number, descentCount: number): boolean {
  return level >= DESCENT_MIN_LEVEL && descentCount < DESCENT_MAX;
}

export function markedTrainingGain(gain: number, points: number): number {
  const safe = Math.max(0, Math.floor(points));
  return Math.round((gain * (10_000 + safe * MARK_TRAINING_BP)) / 10_000);
}

export interface SensibleAction {
  id: string;
  reward: number;
}

/**
 * Trzy sensowne akcje doby z prawdziwych wzorów: zlecenie Zakonu, srebro Portalu i PD Portalu.
 * Poziom rośnie co 8 dób aż do 80. Służy próbie 600 dób bez ślepego zaułka.
 */
export function sensibleDayActions(day: number): readonly SensibleAction[] {
  const safeDay = Math.max(1, Math.floor(day));
  const level = Math.min(CHARACTER_MAX_LEVEL, 1 + Math.floor((safeDay - 1) / 8));
  const mission = findMission('order.quay-patrol');
  if (!mission) throw new Error('Brak zlecenia order.quay-patrol');
  const resolved = resolveMission({
    mission,
    level,
    seed: `descent-day:${safeDay}`,
    chanceBp: 10_000,
    maxLife: 100,
  });
  return [
    { id: 'mission-xp', reward: resolved.experience },
    { id: 'portal-silver', reward: portalBaseSilver(level) },
    { id: 'portal-xp', reward: portalBaseExperience(level) },
  ];
}
