import { describe, expect, it } from 'vitest';

import { DOMAIN_DAY_TARGETS, LEVEL_80_DAY_TARGET, simulateActiveCareer } from '../src/career.js';
import { ALARM_THRESHOLD, deviation } from '../src/targets.js';

describe('tempo kariery aktywnego F2P', () => {
  const career = simulateActiveCareer();

  it('Domena 1, Domena 11 i poziom 80 mieszczą się w 15% celów z rozdziału 10', () => {
    const domain1 = career.domainDays[0] ?? 0;
    const domain11 = career.domainDays[10] ?? 0;
    expect(domain1).toBe(10);
    expect(domain11).toBe(427);
    expect(career.level80Day).toBe(433);
    expect(deviation(domain1, DOMAIN_DAY_TARGETS[0])).toBeLessThanOrEqual(ALARM_THRESHOLD);
    expect(deviation(domain11, DOMAIN_DAY_TARGETS[10])).toBeLessThanOrEqual(ALARM_THRESHOLD);
    expect(deviation(career.level80Day, LEVEL_80_DAY_TARGET)).toBeLessThanOrEqual(ALARM_THRESHOLD);
  });

  it('żadna Domena nie odchyla się od tabeli 10.13 o więcej niż 15%', () => {
    career.domainDays.forEach((day, index) => {
      expect(day).toBeGreaterThan(0);
      expect(deviation(day, DOMAIN_DAY_TARGETS[index] ?? day)).toBeLessThanOrEqual(ALARM_THRESHOLD);
    });
  });

  it('statystyka rośnie także po dniu 450 i jest powtarzalna', () => {
    const again = simulateActiveCareer();
    expect(again).toEqual(career);
    const at = (day: number) =>
      career.samples.find((sample) => sample.day === day)?.effectiveStat ?? 0;
    expect(at(450)).toBeGreaterThan(at(365));
    expect(at(472)).toBeGreaterThan(at(450));
  });
});
