import { describe, expect, it } from 'vitest';

import {
  HOUR_MS,
  MINUTE_MS,
  MISSION_TIERS,
  materializeResource,
  missionExperience,
  missionSilver,
  resourceMax,
  resourceTimers,
  spendResource,
} from '../src/balance.js';
import { grantExperience } from '../src/progression.js';

const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);
const ctx = { level: 1, knowledge: 0 };

describe('limity zasobów (GDD 4.2, 10.1)', () => {
  it('ma wartości z tabeli', () => {
    expect(resourceMax('vigor', ctx)).toBe(100);
    expect(resourceMax('toil', ctx)).toBe(50);
    expect(resourceMax('sanity', ctx)).toBe(100);
    expect(resourceMax('life', ctx)).toBe(100);
    expect(resourceMax('life', { level: 10, knowledge: 0 })).toBe(280);
    expect(resourceMax('sanity', { level: 1, knowledge: 40 })).toBe(70);
  });
});

describe('leniwa regeneracja', () => {
  it('Wigor od zera jest pełny po 3 h 20 min, nie wcześniej', () => {
    const empty = { value: 0, updatedAt: T0 };
    expect(materializeResource('vigor', empty, T0 + 200 * MINUTE_MS - 1, 100).value).toBe(95);
    expect(materializeResource('vigor', empty, T0 + 200 * MINUTE_MS, 100).value).toBe(100);
    expect(resourceTimers('vigor', empty, 100).fullAt).toBe(T0 + 200 * MINUTE_MS);
  });

  it('Znój od zera jest pełny po 5 h', () => {
    const empty = { value: 0, updatedAt: T0 };
    expect(materializeResource('toil', empty, T0 + 5 * HOUR_MS - 1, 50).value).toBe(49);
    expect(materializeResource('toil', empty, T0 + 5 * HOUR_MS, 50).value).toBe(50);
  });

  it('Życie odnawia 5% maksimum co 10 min, a Poczytalność 3 na godzinę', () => {
    expect(
      materializeResource('life', { value: 0, updatedAt: T0 }, T0 + 10 * MINUTE_MS, 280).value,
    ).toBe(14);
    expect(
      materializeResource('sanity', { value: 50, updatedAt: T0 }, T0 + 2 * HOUR_MS, 100).value,
    ).toBe(56);
  });

  it('niepełny tik nie przepada', () => {
    const after = materializeResource(
      'vigor',
      { value: 50, updatedAt: T0 },
      T0 + 15 * MINUTE_MS,
      100,
    );
    expect(after).toEqual({ value: 55, updatedAt: T0 + 10 * MINUTE_MS });
    expect(materializeResource('vigor', after, T0 + 20 * MINUTE_MS, 100).value).toBe(60);
  });

  it('pełny zasób zaczyna odliczanie dopiero od wydania', () => {
    const full = materializeResource('vigor', { value: 100, updatedAt: T0 }, T0 + HOUR_MS, 100);
    expect(full).toEqual({ value: 100, updatedAt: T0 + HOUR_MS });
    const spent = spendResource('vigor', full, T0 + HOUR_MS, 100, 20);
    expect(spent).toEqual({ value: 80, updatedAt: T0 + HOUR_MS });
    expect(resourceTimers('vigor', spent!, 100)).toEqual({
      nextTickAt: T0 + HOUR_MS + 10 * MINUTE_MS,
      fullAt: T0 + HOUR_MS + 40 * MINUTE_MS,
    });
  });

  it('nadwyżka ponad limit (np. z nagród) zostaje, ale nie rośnie', () => {
    expect(
      materializeResource('vigor', { value: 130, updatedAt: T0 }, T0 + HOUR_MS, 100).value,
    ).toBe(130);
  });

  it('cofnięty zegar niczego nie zmienia', () => {
    const stored = { value: 40, updatedAt: T0 };
    expect(materializeResource('vigor', stored, T0 - HOUR_MS, 100)).toBe(stored);
  });

  it('odmawia wydania, gdy zasobu brakuje, także po regeneracji', () => {
    expect(
      spendResource('vigor', { value: 4, updatedAt: T0 }, T0 + 9 * MINUTE_MS, 100, 5),
    ).toBeNull();
    expect(
      spendResource('vigor', { value: 4, updatedAt: T0 }, T0 + 10 * MINUTE_MS, 100, 5),
    ).toEqual({
      value: 4,
      updatedAt: T0 + 10 * MINUTE_MS,
    });
  });
});

describe('zlecenia (GDD 10.1, 10.2, 10.5)', () => {
  it('czasy i koszty Wigoru są z tabeli', () => {
    expect(MISSION_TIERS.map((tier) => [tier.durationMs / MINUTE_MS, tier.vigorCost])).toEqual([
      [5, 5],
      [15, 10],
      [60, 20],
      [240, 35],
      [480, 50],
    ]);
  });

  it('XP = W·(2L+4)·1,2·(1+0,4P)', () => {
    expect(missionExperience(5, 1)).toBe(36);
    expect(missionExperience(20, 10)).toBe(576);
    expect(missionExperience(50, 30, 2)).toBe(Math.round(50 * 64 * 1.2 * 1.8));
  });

  it('Srebro = W·0,5·L^1,25·(1+0,4P)', () => {
    expect(missionSilver(5, 1)).toBe(3);
    expect(missionSilver(20, 10)).toBe(178);
    expect(missionSilver(35, 50, 1)).toBe(Math.round(35 * 0.5 * 50 ** 1.25 * 1.4));
  });
});

describe('grantExperience', () => {
  it('rozlicza kilka awansów naraz', () => {
    // 37 (L1) + 108 (L2) = 145 → poziom 3 z nadwyżką 5.
    expect(grantExperience({ level: 1, experience: 0 }, 150)).toEqual({
      level: 3,
      experience: 5,
      levelsGained: 2,
    });
  });

  it('na poziomie maksymalnym nadmiar przepada', () => {
    expect(grantExperience({ level: 79, experience: 0 }, 10_000_000)).toEqual({
      level: 80,
      experience: 0,
      levelsGained: 1,
    });
  });

  it('odrzuca ujemne XP', () => {
    expect(() => grantExperience({ level: 1, experience: 0 }, -1)).toThrow(RangeError);
  });
});
