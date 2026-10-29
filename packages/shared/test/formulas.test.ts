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

describe('krzywa doświadczenia (GDD 10.2)', () => {
  it.each([
    [1, 30, 30],
    [3, 160, 265],
    [5, 467, 1022],
    [8, 2401, 6482],
    [10, 7173, 16775],
    [79, 744314, 18460322],
  ])('poziom %i: %i do następnego, %i łącznie', (level, next, total) => {
    expect(experienceToNextLevel(level)).toBe(next);
    expect(cumulativeExperience(level)).toBe(total);
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
