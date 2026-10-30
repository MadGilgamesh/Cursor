/**
 * Widok stanu gry liczony w kliencie z danych serwera i czasu serwera — tylko do
 * wyświetlania (te same funkcje co na serwerze, z `@game/shared`).
 */
import {
  MISSIONS,
  RESOURCE_KINDS,
  materializeResource,
  missionTier,
  regenRule,
  resourceTimers,
  type Activity,
  type RegenPace,
  type ResourceKind,
  type Resources,
} from '@game/shared';

export interface ResourceView {
  kind: ResourceKind;
  value: number;
  max: number;
  /** Chwila (czas serwera, ms), od której liczy się następny tik regeneracji. */
  updatedAt: number;
  /** Czas serwera (ms), gdy zasób będzie pełny; `null`, gdy już jest. */
  fullAt: number | null;
}

export function resourceViews(resources: Resources, now: number, pace?: RegenPace): ResourceView[] {
  return RESOURCE_KINDS.map((kind) => {
    const snapshot = resources[kind];
    const stored = { value: snapshot.value, updatedAt: Date.parse(snapshot.updatedAt) };
    const current = materializeResource(kind, stored, now, snapshot.max, pace);
    return {
      kind,
      value: current.value,
      max: snapshot.max,
      updatedAt: current.updatedAt,
      fullAt: resourceTimers(kind, current, snapshot.max, pace).fullAt,
    };
  });
}

/** Zlecenie zakończone, choć serwer mógł go jeszcze nie rozstrzygnąć (pulpit zrobi to przy odświeżeniu). */
export const isReady = (activity: Activity, now: number) =>
  activity.status === 'completed' || Date.parse(activity.endAt) <= now;

export const cheapestMissionCost = () =>
  Math.min(...MISSIONS.map((mission) => missionTier(mission.tierId).vigorCost));

export type NextStep =
  | { kind: 'claim' }
  | { kind: 'wait'; at: number }
  | { kind: 'board'; vigor: number }
  | { kind: 'rest'; at: number };

/** „Następny krok” na Domu (GDD 3.3, 11 DoD 5): gracz nigdy nie trafia w martwy koniec. */
export function nextStep(
  activities: Activity[],
  vigor: ResourceView,
  now: number,
  pace?: RegenPace,
): NextStep {
  if (activities.some((activity) => isReady(activity, now))) return { kind: 'claim' };
  const running = activities.find((activity) => activity.status === 'active');
  if (running) return { kind: 'wait', at: Date.parse(running.endAt) };
  const cost = cheapestMissionCost();
  if (vigor.value >= cost) return { kind: 'board', vigor: vigor.value };
  const { amount, intervalMs } = regenRule('vigor', vigor.max, pace);
  const ticks = Math.ceil((cost - vigor.value) / amount);
  return { kind: 'rest', at: vigor.updatedAt + ticks * intervalMs };
}
