import { describe, expect, it } from 'vitest';

import { DAY_MINUTES, PROFILES, simulateVigor } from '../src/simulate.js';
import {
  ALARM_THRESHOLD,
  REWARD_VIGOR_PER_DAY,
  VIGOR_PER_DAY_TARGETS,
  deviation,
} from '../src/targets.js';

describe('Monte Carlo: Wigor dziennie (GDD 10.1, 10.12)', () => {
  it.each(PROFILES)('$label mieści się w progu alarmu względem tabeli GDD', (profile) => {
    const result = simulateVigor(profile);
    const perDay = result.regenPerDay + REWARD_VIGOR_PER_DAY;
    expect(deviation(perDay, VIGOR_PER_DAY_TARGETS[profile.id])).toBeLessThanOrEqual(
      ALARM_THRESHOLD,
    );
  });

  it.each(PROFILES)('$label: Wigor nigdy nie przekracza limitu 100', (profile) => {
    expect(simulateVigor(profile).peakVigor).toBeLessThanOrEqual(100);
  });

  it('profile wypełniają dobę z 10-godzinną nocą', () => {
    for (const profile of PROFILES) {
      const awake = profile.gapsMinutes.reduce((sum, gap) => sum + gap, 0);
      expect(DAY_MINUTES - awake).toBe(600);
    }
  });

  it('jest deterministyczna dla ziarna, a różne ziarna dają zbliżony wynik', () => {
    const [active] = PROFILES;
    expect(simulateVigor(active!, { seed: 'a' })).toEqual(simulateVigor(active!, { seed: 'a' }));
    const spread = Math.abs(
      simulateVigor(active!, { seed: 'a' }).regenPerDay -
        simulateVigor(active!, { seed: 'b' }).regenPerDay,
    );
    expect(spread).toBeLessThan(5);
  });

  it('wykrywa odchylenie: Wigor wyłącznie z regeneracji (bez nagród) daje inny wynik niż GDD', () => {
    // Kontrola czułości testu — bez 40 Wigoru z nagród aktywny gracz wypada poniżej tabeli.
    const [active] = PROFILES;
    expect(simulateVigor(active!).regenPerDay).toBeLessThan(VIGOR_PER_DAY_TARGETS.active);
  });
});
