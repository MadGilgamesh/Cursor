/**
 * Wektory referencyjne („golden vectors”) dla deterministycznej logiki.
 *
 * Te same wartości sprawdzają testy pakietu współdzielonego, serwera i klienta.
 * Jeśli którykolwiek test przestanie się zgadzać, oznacza to zmianę wyników
 * losowań lub formuł — a więc niezgodność z zapisanymi powtórkami i stanem gry.
 * Zmiana tych wartości wymaga świadomej decyzji (nowy `BALANCE_VERSION`).
 */
import { applyBp } from './fixed-point.js';
import { cumulativeExperience, experienceToNextLevel } from './progression.js';
import { createRng } from './rng.js';

export interface GoldenVectors {
  readonly rngUint32: readonly number[];
  readonly rngInt1to100: readonly number[];
  readonly applyBp: readonly number[];
  /** Kolumna „XP z L−1 do L” tabeli GDD 10.2 dla poziomów `GOLDEN_LEVELS`. */
  readonly experienceFromPreviousLevel: readonly number[];
  /** Łączne XP do osiągnięcia poziomu — suma progów stosowanych przez grę. */
  readonly totalExperienceToReach: readonly number[];
}

export const GOLDEN_SEED = 'zapomniany-brzeg';

/** Poziomy z tabeli krzywej doświadczenia w GDD 1.1 (rozdz. 10.2). */
export const GOLDEN_LEVELS = [5, 10, 15, 20, 30, 40, 50, 60, 70, 80] as const;

/**
 * Oczekiwane wyniki — zapisane na stałe, nie wyliczane. Progi poziomów pochodzą
 * wprost z tabeli GDD. Kolumna „XP łącznie” w GDD sumuje wartości przed
 * zaokrągleniem, więc różni się od sumy progów gry o kilka PD (test sprawdza tolerancję).
 */
export const GOLDEN_VECTORS: GoldenVectors = {
  rngUint32: [351404743, 3704348229, 2730687410, 260559084, 1349879777],
  rngInt1to100: [60, 1, 76, 18, 50, 74, 30, 31, 59, 61],
  applyBp: [150, 332, -4, 12345],
  experienceFromPreviousLevel: [
    446, 4894, 23945, 47543, 123012, 239522, 400264, 607856, 864532, 1172259,
  ],
  totalExperienceToReach: [
    833, 14995, 101368, 288317, 1146499, 2982138, 6223800, 11328576, 18777512, 29072463,
  ],
};

/** Wylicza wektory bieżącą implementacją — porównywane z `GOLDEN_VECTORS`. */
export function computeGoldenVectors(): GoldenVectors {
  const uintRng = createRng(GOLDEN_SEED);
  const intRng = createRng(`${GOLDEN_SEED}:int`);
  return {
    rngUint32: Array.from({ length: 5 }, () => uintRng.nextUint32()),
    rngInt1to100: Array.from({ length: 10 }, () => intRng.nextInt(1, 100)),
    applyBp: [applyBp(1000, 1500), applyBp(999, 3333), applyBp(-7, 5000), applyBp(12_345, 10_000)],
    experienceFromPreviousLevel: GOLDEN_LEVELS.map((level) => experienceToNextLevel(level - 1)),
    totalExperienceToReach: GOLDEN_LEVELS.map((level) => cumulativeExperience(level - 1)),
  };
}
