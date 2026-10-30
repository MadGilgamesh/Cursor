import { describe, expect, it } from 'vitest';

import { missionChanceBp } from '../src/balance.js';
import { ENEMIES, ITEMS, MISSIONS, findMission, validateStaticData } from '../src/data/index.js';
import { resolveMission } from '../src/missions.js';

const data = { missions: MISSIONS, enemies: ENEMIES, items: ITEMS };

describe('dane statyczne', () => {
  it('bieżące dane są poprawne', () => {
    expect(() => {
      validateStaticData();
    }).not.toThrow();
  });

  it('wykrywa zduplikowane identyfikatory', () => {
    const [first] = MISSIONS;
    expect(() => {
      validateStaticData({ ...data, missions: [first!, first!] });
    }).toThrow(/Zduplikowany/);
  });

  it('findMission znajduje zlecenie po identyfikatorze', () => {
    expect(findMission('order.quay-patrol')?.tierId).toBe('m5');
    expect(findMission('trial.wreck-search')).toBeUndefined();
  });
});

describe('resolveMission', () => {
  const mission = findMission('order.canal-hunt')!;
  const base = { mission, level: 1, maxLife: 100, chanceBp: 10_000 };

  it('jest deterministyczne dla ziarna', () => {
    const input = { ...base, seed: 'ziarno' };
    expect(resolveMission(input)).toEqual(resolveMission(input));
  });

  it('przy pewnym sukcesie liczy nagrody z balansu i wybiera opis sukcesu', () => {
    const result = resolveMission({ ...base, seed: 'sukces' });
    expect(mission.successTexts).toContain(result.outcome);
    expect(result).toMatchObject({
      balanceVersion: 10,
      success: true,
      experience: 144,
      silver: 10,
    });
  });

  it('przy pewnej porażce zlecenia Zakonu zabiera Życie i Poczytalność', () => {
    const result = resolveMission({ ...base, chanceBp: 0, seed: 'porażka' });
    expect(result.success).toBe(false);
    expect(result.experience).toBe(0);
    expect(result.lifeLoss).toBeGreaterThanOrEqual(30);
    expect(result.lifeLoss).toBeLessThanOrEqual(50);
    expect(result.sanityLoss).toBeGreaterThanOrEqual(3);
    expect(mission.failureTexts).toContain(result.outcome);
  });

  it('szansa przy równych statystykach to 55%', () => {
    expect(missionChanceBp(0, 20, 20)).toBe(5_500);
    expect(missionChanceBp(0, 56, 20)).toBe(10_000);
  });
});
