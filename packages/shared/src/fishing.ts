/**
 * Połów weryfikowany na serwerze (GDD 5.20, 9.1).
 * Idealne czasy — reakcja dokładnie w chwili brania i napięcie w środku każdej strefy —
 * są flagowane. Nie banują same z siebie.
 */
import { createRng } from './rng.js';
import type { CityId } from './world.js';

export const CAST_TOIL = 1;
export const BITE_TOLERANCE_MS = 150;
export const ODDITY_BP = 800;
export const BASKET_CAP = 10;
export const HOOKS_START = 5;
export const PULLS = 6;

export interface FisheryDef {
  id: string;
  city: CityId;
  name: string;
  fish: readonly string[];
}

export const FISHERIES: readonly FisheryDef[] = [
  { id: 'salt-port', city: 'salt', name: 'Port w Soli', fish: ['Śledź', 'Dorsz', 'Węgorz'] },
  { id: 'mire-bog', city: 'mire', name: 'Bagna Mgławca', fish: ['Lin', 'Karaś', 'Żaba błotna'] },
  { id: 'brink-ice', city: 'brink', name: 'Przerębla Kresu', fish: ['Głowacz', 'Miętus', 'Lód'] },
];

export function fisheryFor(city: CityId): FisheryDef | undefined {
  return FISHERIES.find((fishery) => fishery.city === city);
}

export interface PullZone {
  center: number;
  half: number;
}

export interface CastPlan {
  biteAtMs: number;
  windowMs: number;
  pulls: PullZone[];
  oddity: boolean;
  speciesIndex: number;
  weight: number;
}

/** Harmonogram z ziarna. Klient może go odtworzyć; serwer i tak sprawdza czasy. */
export function planCast(seed: string): CastPlan {
  const rng = createRng(`hol:${seed}`);
  const pulls: PullZone[] = [];
  for (let index = 0; index < PULLS; index += 1) {
    pulls.push({ center: rng.nextInt(25, 75), half: 12 });
  }
  return {
    biteAtMs: rng.nextInt(2_000, 8_000),
    windowMs: rng.nextInt(400, 900),
    pulls,
    oddity: rng.rollBp(ODDITY_BP),
    speciesIndex: rng.nextInt(0, 2),
    weight: rng.nextInt(200, 4_000),
  };
}

export interface ReelInput {
  reactionOffsetMs: number;
  tensions: readonly number[];
}

export interface ReelVerdict {
  caught: boolean;
  flagged: boolean;
}

/**
 * Trafienie: reakcja w oknie z tolerancją ±150 ms i napięcie w strefie.
 * Flaga: reakcja co do milisekundy w chwili brania i napięcie dokładnie w środku.
 */
export function verifyReel(plan: CastPlan, input: ReelInput): ReelVerdict {
  const early = plan.biteAtMs - BITE_TOLERANCE_MS;
  const late = plan.biteAtMs + plan.windowMs + BITE_TOLERANCE_MS;
  const inWindow = input.reactionOffsetMs >= early && input.reactionOffsetMs <= late;
  const inZone = plan.pulls.every((pull, index) => {
    const value = input.tensions[index];
    return value !== undefined && Math.abs(value - pull.center) <= pull.half;
  });
  const ideal =
    input.reactionOffsetMs === plan.biteAtMs &&
    plan.pulls.every((pull, index) => input.tensions[index] === pull.center);
  return { caught: inWindow && inZone, flagged: ideal && inWindow && inZone };
}
