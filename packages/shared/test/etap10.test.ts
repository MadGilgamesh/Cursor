import { describe, expect, it } from 'vitest';

import { DAY_MS } from '../src/balance.js';
import {
  DESCENT_MAX,
  DESCENT_MIN_LEVEL,
  canDescend,
  markedTrainingGain,
  sensibleDayActions,
} from '../src/descent.js';
import { ACT_CYCLE_MS, expeditionKnowledge, expeditionOpen } from '../src/expedition.js';
import { beyondStarEcho, godEchoForClear, portalDomain } from '../src/data/portal.js';
import { bankEssence, ESSENCE_XP_PER_POINT, experienceToNextLevel } from '../src/progression.js';
import { outerAspect, portalModifier } from '../src/portal.js';
import { simulateCombat } from '../src/combat.js';

describe('Etap 10', () => {
  it('Piętno Szkolenia dodaje 3% przyrostu za punkt', () => {
    expect(DESCENT_MIN_LEVEL).toBe(60);
    expect(DESCENT_MAX).toBe(10);
    expect(canDescend(59, 0)).toBe(false);
    expect(canDescend(60, 0)).toBe(true);
    expect(canDescend(80, 10)).toBe(false);
    expect(markedTrainingGain(100, 0)).toBe(100);
    expect(markedTrainingGain(100, 1)).toBe(103);
    expect(markedTrainingGain(100, 10)).toBe(130);
  });

  it('Esencja bierze pełne miliony XP z poziomu 80', () => {
    expect(ESSENCE_XP_PER_POINT).toBe(1_000_000);
    expect(bankEssence(0, 1_000_000)).toEqual({ essence: 1, essenceXp: 0 });
    expect(bankEssence(999_999, 2)).toEqual({ essence: 1, essenceXp: 1 });
    const gate = experienceToNextLevel(79);
    expect(gate).toBeGreaterThan(0);
  });

  it('przez 600 dób są co najmniej trzy nagrody większe od zera', () => {
    for (let day = 1; day <= 600; day += 1) {
      const actions = sensibleDayActions(day);
      expect(actions).toHaveLength(3);
      for (const action of actions) expect(action.reward).toBeGreaterThan(0);
    }
    expect(sensibleDayActions(1).every((action) => action.reward > 0)).toBe(true);
    expect(sensibleDayActions(600)[0]?.reward).toBeGreaterThan(
      sensibleDayActions(1)[0]?.reward ?? 0,
    );
  });

  it('Domeny 10 i 11 mają Bramę, Chaos i echa Spoza Gwiazd', () => {
    expect(portalModifier(10)).toBe('gate');
    expect(portalModifier(11)).toBe('chaos');
    expect(portalModifier(12)).toBeNull();
    expect(portalDomain(10)?.god).toBe('Yog-Sothoth');
    expect(portalDomain(11)?.god).toBe('Azathoth');
    expect(portalDomain(10)?.units).toHaveLength(10);
    expect(portalDomain(11)?.units).toHaveLength(10);
    expect(outerAspect('gate', 1, 'brama')).toBe('depth');
    expect(outerAspect('gate', 8, 'brama')).toBe('depth');
    expect(outerAspect('gate', 10, 'brama')).toBe('swarm');
    expect(outerAspect('chaos', 1, 'to-samo')).toBe(outerAspect('chaos', 3, 'to-samo'));
    expect(beyondStarEcho(10)?.id).toBe('echo.god.yog.beyond');
    expect(beyondStarEcho(11)?.id).toBe('echo.god.azathoth.beyond');
    expect(beyondStarEcho(9)).toBeUndefined();
    expect(godEchoForClear(10, 10, 8)).toBeUndefined();
    expect(expeditionKnowledge('ys-kahal')).toBe(30);
    expect(expeditionKnowledge('black-eye')).toBe(50);
    expect(expeditionKnowledge('canals')).toBe(0);
  });

  it('sobota i koniec aktu są oknami wypraw, a Chaos nie rusza ziarna walki', () => {
    const saturday = Date.UTC(2026, 9, 31, 12);
    const friday = Date.UTC(2026, 9, 30, 12);
    expect(new Date(saturday).getUTCDay()).toBe(6);
    expect(expeditionOpen('saturday', saturday)).toBe(true);
    expect(expeditionOpen('saturday', friday)).toBe(false);
    expect(expeditionOpen('act-end', 55 * DAY_MS)).toBe(true);
    expect(expeditionOpen('act-end', 54 * DAY_MS)).toBe(false);
    expect(expeditionOpen('act-end', ACT_CYCLE_MS)).toBe(false);
    const player = {
      level: 10,
      stats: { strength: 40, defense: 40, accuracy: 40, evasion: 80 },
      life: 400,
      maxLife: 400,
      sanity: 100,
      maxSanity: 100,
      classId: 'butcher' as const,
      weaponDamage: 36,
      knowledge: 0,
    };
    const enemy = {
      stats: { strength: 10, defense: 10, accuracy: 10, evasion: 10 },
      life: 30,
      damage: 1,
      dread: 0,
      gaze: false,
    };
    expect(simulateCombat(player, enemy, 'chaos-seed', 'chaos').events).toEqual(
      simulateCombat(player, enemy, 'chaos-seed').events,
    );
  });
});
