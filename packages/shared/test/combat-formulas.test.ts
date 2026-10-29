import { describe, expect, it } from 'vitest';

import {
  classExperienceToNext,
  damageRatio,
  enemyDamage,
  enemyLevel,
  enemyLife,
  enemyStat,
  fightExperience,
  hitChance,
  trainingGainCenti,
  weaponDamage,
} from '../src/balance.js';
import { simulateCombat, tutorialEnemy } from '../src/combat.js';

describe('tabela wrogów (GDD 10.4)', () => {
  it.each([
    [1, 25, 80, 11],
    [10, 956, 285, 38],
    [30, 6_848, 885, 98],
    [50, 17_159, 1_685, 158],
  ])('piętro %i: stat %i, życie %i, obrażenia %i', (floor, stat, life, damage) => {
    expect(enemyStat(floor)).toBe(stat);
    expect(enemyLife(floor)).toBe(life);
    expect(enemyDamage(floor)).toBe(damage);
  });
});

describe('obrażenia i trafienie (GDD 10.4)', () => {
  it('D_broni rośnie ×1,35 na Stopień', () => {
    expect(weaponDamage(1)).toBeCloseTo(20, 5);
    expect(weaponDamage(2)).toBeCloseTo(27, 5);
    expect(weaponDamage(3)).toBeCloseTo(36.45, 5);
  });

  it('przykład L10, Rzeźnik, równe statystyki: szansa ~0,70 i stosunek ~1,07', () => {
    expect(hitChance(100, 100, 0.87)).toBeCloseTo(1.3 / 1.87, 5);
    expect(damageRatio(100, 100, 0.87)).toBeCloseTo(2 / 1.87, 5);
  });

  it('walka z samouczka jest wygrywana słabym topielcem i da się ją odtworzyć', () => {
    const player = {
      level: 1,
      stats: { strength: 20, defense: 20, accuracy: 20, evasion: 20 },
      life: 100,
      maxLife: 100,
      sanity: 100,
      maxSanity: 100,
      classId: null,
      weaponDamage: 10,
      knowledge: 0,
    };
    const first = simulateCombat(player, tutorialEnemy(), 'kostnica');
    const second = simulateCombat(player, tutorialEnemy(), 'kostnica');
    expect(first).toEqual(second);
    expect(first.winner).toBe('player');
    expect(first.events.length).toBeGreaterThan(0);
  });
});

describe('trening (GDD 10.3)', () => {
  it('5 Wigoru w Piwnicy przy 20 punktach daje ~19,6 punktu (GDD 10.3)', () => {
    // 5 · 4 · 200 / (200 + √20) ≈ 19,56 punktu = 1956 setnych.
    expect(trainingGainCenti(20 * 100, 5, 4)).toBe(1_956);
  });
});

describe('doświadczenie', () => {
  it('walka z piętra 1 na 1. poziomie daje 160 PD (Lw obcięte do L+5), klasa kosztuje 500', () => {
    expect(enemyLevel(1)).toBe(7);
    expect(fightExperience(7, 1, 'random')).toBe(160);
    expect(classExperienceToNext(0)).toBe(500);
  });
});
