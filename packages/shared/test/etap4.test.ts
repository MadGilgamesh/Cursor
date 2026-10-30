import { describe, expect, it } from 'vitest';

import { SEAL_STAT_FACTOR, computeLoadout } from '../src/character.js';
import { simulateCombat, type PlayerCombatant, type EnemyCombatant } from '../src/combat.js';
import { planCast, verifyReel } from '../src/fishing.js';
import { findCrop, plotPhase, witherAt, type PlotState } from '../src/garden.js';
import {
  ambushChanceBp,
  clinicSilver,
  isWolfHour,
  travelDurationMs,
  weatherAt,
} from '../src/world.js';
import { HOUR_MS, MINUTE_MS } from '../src/balance.js';

const player = (): PlayerCombatant => ({
  level: 20,
  stats: { strength: 400, defense: 400, accuracy: 80, evasion: 80 },
  life: 400,
  maxLife: 400,
  sanity: 80,
  maxSanity: 100,
  classId: null,
  weaponDamage: 30,
  knowledge: 0,
});

const enemy = (): EnemyCombatant => ({
  stats: { strength: 40, defense: 40, accuracy: 40, evasion: 40 },
  life: 5_000,
  damage: 1,
  dread: 0,
  gaze: false,
});

describe('Etap 4 — czas, ogród, połów, Tętno', () => {
  it('mgła i kuc skracają albo wydłużają tę samą trasę', () => {
    const plain = travelDurationMs('salt', 'ilmar', 'clear', null);
    expect(plain).toBe(40 * MINUTE_MS);
    const slowed = travelDurationMs('salt', 'ilmar', 'fog', null);
    expect(slowed).toBe(Math.round(40 * MINUTE_MS * 1.1));
    const ridden = travelDurationMs('salt', 'ilmar', 'clear', 'pony');
    expect(ridden).toBe(Math.round(40 * MINUTE_MS * 0.85));
    expect(travelDurationMs('salt', 'salt', 'clear', null)).toBeNull();
  });

  it('Godzina Wilka to ostatnia godzina czterogodzinnej doby', () => {
    expect(isWolfHour(3 * HOUR_MS - 1)).toBe(false);
    expect(isWolfHour(3 * HOUR_MS)).toBe(true);
    expect(isWolfHour(4 * HOUR_MS)).toBe(false);
  });

  it('pogoda w tym samym slocie jest ta sama', () => {
    expect(weatherAt(0)).toBe(weatherAt(MINUTE_MS));
    expect(ambushChanceBp(false, 0)).toBe(0);
    expect(ambushChanceBp(true, 0)).toBe(1000);
    expect(ambushChanceBp(true, 100)).toBe(100);
  });

  it('uprawa usycha dokładnie na końcu okna i ani chwili wcześniej', () => {
    const crop = findCrop('wormwood');
    expect(crop).toBeTruthy();
    const plantedAt = 1_000_000;
    const plot: PlotState = { cropId: 'wormwood', plantedAt, wateredAt: null };
    const dead = witherAt(plantedAt, crop!.phaseMs);
    expect(plotPhase(plot, dead - 1)).toBe('thirsty');
    expect(plotPhase(plot, dead)).toBe('withered');
  });

  it('idealny hol jest flagowany, a zwykłe trafienie w strefę nie', () => {
    const plan = planCast('latarnia');
    const ideal = verifyReel(plan, {
      reactionOffsetMs: plan.biteAtMs,
      tensions: plan.pulls.map((pull) => pull.center),
    });
    expect(ideal).toEqual({ caught: true, flagged: true });
    const human = verifyReel(plan, {
      reactionOffsetMs: plan.biteAtMs + 40,
      tensions: plan.pulls.map((pull) => pull.center + 3),
    });
    expect(human).toEqual({ caught: true, flagged: false });
    const early = verifyReel(plan, {
      reactionOffsetMs: plan.biteAtMs - 151,
      tensions: plan.pulls.map((pull) => pull.center),
    });
    expect(early.caught).toBe(false);
  });

  it('Opanowanie 200 znosi Tętno Skały', () => {
    const weak: PlayerCombatant = {
      ...player(),
      level: 1,
      weaponDamage: 1,
      life: 500,
      maxLife: 500,
      stats: { strength: 8, defense: 80, accuracy: 80, evasion: 200 },
    };
    const calm = simulateCombat({ ...weak, composure: 200 }, enemy(), 'tetno-spokoj', 'pulse');
    expect(calm.rounds).toBeGreaterThanOrEqual(5);
    expect(calm.events.some((event) => event.kind === 'pulse')).toBe(false);
    const shaken = Array.from({ length: 40 }, (_, index) =>
      simulateCombat(weak, enemy(), `tetno-${index}`, 'pulse'),
    );
    expect(shaken.some((log) => log.events.some((event) => event.kind === 'pulse'))).toBe(true);
  });

  it('Pieczętowanie podnosi premię przedmiotu o 8%', () => {
    const item = {
      itemId: 'gear.butcher.torso.1',
      slot: 'torso' as const,
      qualityBp: 10_000,
      rarity: 'common' as const,
      enhancement: 0,
      instanceId: 'sztuka-1',
    };
    const plain = computeLoadout([item]);
    const sealed = computeLoadout([item], ['sztuka-1']);
    const stat = (['strength', 'defense', 'accuracy', 'evasion'] as const).find(
      (key) => plain.bonusBp[key] > 0,
    );
    expect(stat).toBeTruthy();
    expect(sealed.bonusBp[stat!]).toBe(Math.round(plain.bonusBp[stat!] * SEAL_STAT_FACTOR));
    expect(clinicSilver(1)).toBe(30);
  });
});
