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
  readonly experienceToNextLevel: readonly number[];
  readonly cumulativeExperience: readonly number[];
}

export const GOLDEN_SEED = 'zapomniany-brzeg';

/** Poziomy z tabeli krzywej doświadczenia w GDD (rozdz. 10.2). */
export const GOLDEN_LEVELS = [1, 3, 5, 8, 10, 15, 20, 30, 40, 50, 60, 79] as const;

/** Oczekiwane wyniki — zapisane na stałe, nie wyliczane. Wartości XP pochodzą wprost z tabeli GDD. */
export const GOLDEN_VECTORS: GoldenVectors = {
  rngUint32: [351404743, 3704348229, 2730687410, 260559084, 1349879777],
  rngInt1to100: [60, 1, 76, 18, 50, 74, 30, 31, 59, 61],
  applyBp: [150, 332, -4, 12345],
  experienceToNextLevel: [
    30, 160, 467, 2401, 7173, 17772, 33896, 84313, 161011, 265975, 400835, 744314,
  ],
  cumulativeExperience: [
    30, 265, 1022, 6482, 16775, 82323, 217255, 812768, 2055171, 4218552, 7594758, 18460322,
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
    experienceToNextLevel: GOLDEN_LEVELS.map(experienceToNextLevel),
    cumulativeExperience: GOLDEN_LEVELS.map(cumulativeExperience),
  };
}
