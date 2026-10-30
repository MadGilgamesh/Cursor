import { describe, expect, it } from 'vitest';

import { applyBp, clampInt } from '../src/fixed-point.js';
import { computeGoldenVectors, GOLDEN_VECTORS } from '../src/golden-vectors.js';
import {
  CHARACTER_MAX_LEVEL,
  cumulativeExperience,
  experienceToNextLevel,
} from '../src/progression.js';

describe('applyBp', () => {
  it('zaokrągla w dół, także dla liczb ujemnych', () => {
    expect(applyBp(1000, 1500)).toBe(150);
    expect(applyBp(999, 3333)).toBe(332);
    expect(applyBp(-7, 5000)).toBe(-4);
  });

  it('odrzuca wartości niecałkowite i przepełnienie', () => {
    expect(() => applyBp(1.5, 100)).toThrow(RangeError);
    expect(() => applyBp(Number.MAX_SAFE_INTEGER, 10_000)).toThrow(RangeError);
  });
});

describe('clampInt', () => {
  it('przycina do zakresu', () => {
    expect(clampInt(5, 0, 3)).toBe(3);
    expect(clampInt(-5, 0, 3)).toBe(0);
    expect(clampInt(2, 0, 3)).toBe(2);
    expect(() => clampInt(1, 3, 0)).toThrow(RangeError);
  });
});

describe('krzywa doświadczenia (GDD 1.1, 10.2)', () => {
  // [poziom L, XP z L−1 do L, XP łącznie do L]. Do poziomu 10 to tabela GDD.
  // Dalej próg ma pochylenie t(L) = (L/10)^(1/8), więc kolumna GDD już nie obowiązuje.
  const EARLY_TABLE = [
    [5, 446, 832],
    [10, 4_894, 14_994],
  ] as const;
  const TILTED = [
    [15, 24_971, 103_623],
    [20, 51_509, 303_681],
    [30, 140_515, 1_266_434],
    [40, 283_930, 3_412_626],
    [50, 488_213, 7_322_889],
    [60, 758_837, 13_636_655],
    [70, 1_100_603, 23_044_203],
    [80, 1_517_826, 36_281_037],
  ] as const;

  it.each(EARLY_TABLE)('poziom %i: próg %i jak w tabeli GDD', (level, fromPrevious) => {
    expect(experienceToNextLevel(level - 1)).toBe(fromPrevious);
  });

  it.each(EARLY_TABLE)(
    'poziom %i: suma progów gry zgadza się z kolumną „łącznie” z dokładnością do zaokrągleń',
    (level, _fromPrevious, total) => {
      // Każdy z L−1 progów jest zaokrąglany osobno, więc różnica nie przekracza (L−1)/2.
      expect(Math.abs(cumulativeExperience(level - 1) - total)).toBeLessThanOrEqual(
        (level - 1) / 2,
      );
    },
  );

  it.each(TILTED)('poziom %i: próg %i z pochyleniem kariery', (level, fromPrevious, total) => {
    expect(experienceToNextLevel(level - 1)).toBe(fromPrevious);
    expect(cumulativeExperience(level - 1)).toBe(total);
  });

  it('rośnie monotonicznie aż do poziomu maksymalnego', () => {
    for (let level = 1; level < CHARACTER_MAX_LEVEL - 1; level++) {
      expect(experienceToNextLevel(level + 1)).toBeGreaterThan(experienceToNextLevel(level));
    }
    expect(experienceToNextLevel(CHARACTER_MAX_LEVEL)).toBe(0);
  });

  it('odrzuca poziomy spoza zakresu', () => {
    expect(() => experienceToNextLevel(0)).toThrow(RangeError);
    expect(() => experienceToNextLevel(CHARACTER_MAX_LEVEL + 1)).toThrow(RangeError);
    expect(() => experienceToNextLevel(2.5)).toThrow(RangeError);
  });
});

describe('wektory referencyjne', () => {
  it('bieżąca implementacja odtwarza zapisane wartości', () => {
    expect(computeGoldenVectors()).toEqual(GOLDEN_VECTORS);
  });
});
