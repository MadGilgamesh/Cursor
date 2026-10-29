import { describe, expect, it } from 'vitest';

import {
  MISSIONS,
  STATIC_DATA_VERSION,
  findMission,
  validateStaticData,
} from '../src/data/index.js';
import { resolveMission } from '../src/missions.js';

describe('dane statyczne', () => {
  it('bieżące dane są poprawne', () => {
    expect(STATIC_DATA_VERSION).toBeGreaterThan(0);
    expect(() => {
      validateStaticData();
    }).not.toThrow();
  });

  it('wykrywa zduplikowane identyfikatory i błędne odwołania', () => {
    const [first] = MISSIONS;
    expect(() => {
      validateStaticData([first!, first!]);
    }).toThrow(/Zduplikowany/);
    expect(() => {
      validateStaticData([{ ...first!, tierId: 'h99' as never }]);
    }).toThrow();
    expect(() => {
      validateStaticData([{ ...first!, outcomes: [] }]);
    }).toThrow();
  });

  it('findMission znajduje zlecenie po identyfikatorze', () => {
    expect(findMission('trial.wreck-search')?.tierId).toBe('m5');
    expect(findMission('nie.istnieje')).toBeUndefined();
  });
});

describe('resolveMission', () => {
  const mission = findMission('trial.amber-ebb')!;

  it('jest deterministyczne dla ziarna', () => {
    expect(resolveMission(mission, 3, 'ziarno')).toEqual(resolveMission(mission, 3, 'ziarno'));
  });

  it('wybiera opis z definicji i liczy nagrody z balansu', () => {
    const result = resolveMission(mission, 1, 'inne-ziarno');
    expect(mission.outcomes.map((o) => o.text)).toContain(result.outcome);
    expect(result).toMatchObject({ balanceVersion: 1, experience: 144, silver: 10 });
  });

  it('różne ziarna dają różne warianty opisu', () => {
    const outcomes = new Set(
      Array.from({ length: 50 }, (_, i) => resolveMission(mission, 1, `seed-${i}`).outcome),
    );
    expect(outcomes.size).toBe(mission.outcomes.length);
  });
});
