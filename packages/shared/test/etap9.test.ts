import { describe, expect, it } from 'vitest';

import { enemyDamage, enemyLife, enemyStat, resourceMax } from '../src/balance.js';
import { simulateCombat, type PlayerCombatant } from '../src/combat.js';
import {
  ACT_DAYS,
  CLOCK_MAX_BP,
  PATRON_KEY_REGEN_MS,
  PATRON_VIGOR_MAX,
  abyssMutatorBp,
  abyssRankSigils,
  cappedSides,
  clockDayDeltaBp,
  closeActDay,
  deadNightOpen,
  effectivePlayerPoints,
  emptyActClock,
  finaleSigils,
  keyRegenIntervalMs,
  lanternFalls,
  lanternPhase,
  lanternScore,
  referralTitles,
  resolveLantern,
} from '../src/conjunction.js';
import { portalDomain } from '../src/data/portal.js';
import { domainAspect } from '../src/hearth.js';
import { materializeKeyRing, wellEnemyStat } from '../src/portal.js';

const player = (classId: PlayerCombatant['classId']): PlayerCombatant => ({
  level: 10,
  stats: { strength: 100, defense: 100, accuracy: 100, evasion: 100 },
  life: 200,
  maxLife: 200,
  sanity: 100,
  maxSanity: 100,
  classId,
  weaponDamage: 20,
  knowledge: 0,
  panicImmune: true,
});

describe('Etap 9 — Zegar Koniunkcji', () => {
  it('bez graczy dochodzi do 100% w 53. dniu', () => {
    expect(clockDayDeltaBp(0, 0, 0)).toBe(190);
    let state = emptyActClock();
    for (let day = 0; day < 52; day += 1) {
      state = closeActDay(state, 0, 0, 0).state;
    }
    expect(state.finale).toBe('pending');
    expect(state.clockBp).toBe(52 * 190);
    const last = closeActDay(state, 0, 0, 0);
    expect(last.state.clockBp).toBe(CLOCK_MAX_BP);
    expect(last.state.finale).toBe('emergence');
    expect(last.finaleStarted).toBe(true);
    expect(closeActDay(last.state, 0, 0, 0).finaleStarted).toBe(false);
  });

  it('dwa boty po 5 PL trzymają zegar pod 100% przez 56 dni i finał jest jeden', () => {
    const delta = clockDayDeltaBp(10, 0, 2);
    expect(delta).toBe(127);
    let state = emptyActClock();
    let finales = 0;
    for (let day = 0; day < ACT_DAYS; day += 1) {
      const step = closeActDay(state, 10, 0, 2);
      if (step.finaleStarted) finales += 1;
      state = step.state;
    }
    expect(state.clockBp).toBe(56 * 127);
    expect(state.clockBp).toBeLessThan(CLOCK_MAX_BP);
    expect(state.finale).toBe('repelled');
    expect(finales).toBe(1);
    expect(state.thresholds).toEqual([2_500, 5_000]);
    expect(finaleSigils('repelled', true, false)).toBe(5);
    expect(finaleSigils('repelled', false, true)).toBe(2);
    expect(finaleSigils('emergence', false, true)).toBe(5);
  });

  it('powyżej 15 punktów zwrot maleje, a 30 to sufit', () => {
    expect(effectivePlayerPoints(15)).toBe(15);
    expect(effectivePlayerPoints(30)).toBe(22);
    expect(effectivePlayerPoints(40)).toBe(22);
    expect(cappedSides(30, 0)).toEqual({ pl: 22, pk: 0 });
  });
});

describe('Etap 9 — Latarnie, Patronat, Noc Zmarłych', () => {
  it('sobota 19:15 UTC to bitwa, a niedziela to wypłata', () => {
    expect(lanternPhase(Date.parse('2026-10-31T19:15:00Z'))).toBe('battle');
    expect(lanternPhase(Date.parse('2026-10-31T20:30:00Z'))).toBe('choose');
    expect(lanternPhase(Date.parse('2026-11-01T12:00:00Z'))).toBe('payout');
    expect(lanternPhase(Date.parse('2026-10-29T12:00:00Z'))).toBe('apply');
  });

  it('jedno zgłoszenie na pustą latarnię przechodzi bez bitwy', () => {
    expect(
      resolveLantern({
        hasDefender: false,
        hasPretender: true,
        defenderPositions: 0,
        pretenderPositions: 0,
      }),
    ).toBe('uncontested');
    expect(lanternFalls(2)).toBe(true);
    expect(lanternScore(3)).toBe(9);
    expect(
      resolveLantern({
        hasDefender: true,
        hasPretender: true,
        defenderPositions: 2,
        pretenderPositions: 2,
      }),
    ).toBe('dark');
  });

  it('Patronat podnosi Wigor do 200 i skraca Pęk do 3,5 h', () => {
    expect(resourceMax('vigor', { level: 1, knowledge: 0 })).toBe(100);
    expect(resourceMax('vigor', { level: 1, knowledge: 0, patron: true })).toBe(PATRON_VIGOR_MAX);
    expect(keyRegenIntervalMs(true)).toBe(PATRON_KEY_REGEN_MS);
    const patron = materializeKeyRing(
      { regenKeys: 0, regenUpdatedAt: 0, lootKeys: 0, shards: 0 },
      PATRON_KEY_REGEN_MS,
      6,
      PATRON_KEY_REGEN_MS,
    );
    expect(patron.regenKeys).toBe(1);
  });

  it('Noc Zmarłych jest otwarta 30 października i zamknięta 2 listopada', () => {
    expect(deadNightOpen(Date.parse('2026-10-30T12:00:00Z'))).toBe(true);
    expect(deadNightOpen(Date.parse('2026-11-02T00:00:00Z'))).toBe(false);
    expect(referralTitles(3)).toEqual(['Świadek', 'Pochodnia']);
    expect(abyssRankSigils(1)).toBe(3);
    expect(abyssRankSigils(11)).toBe(0);
  });
});

describe('Etap 9 — Bezdeń i Domena 9', () => {
  it('piętro 101 jest silniejsze od setnego, a mutator mieści się w ±30%', () => {
    expect(wellEnemyStat(100)).toBe(enemyStat(100));
    expect(wellEnemyStat(101)).toBeGreaterThan(enemyStat(100));
    expect(wellEnemyStat(101)).toBe(Math.round(enemyStat(100) * 1.035));
    const mutator = abyssMutatorBp('2026-10-26');
    expect(Math.abs(mutator)).toBeGreaterThanOrEqual(1_000);
    expect(Math.abs(mutator)).toBeLessThanOrEqual(3_000);
    expect(wellEnemyStat(50, mutator)).toBeGreaterThan(0);
    expect(enemyLife(100)).toBeGreaterThan(0);
    expect(enemyDamage(100)).toBeGreaterThan(0);
  });

  it('Nyarlathotep ma aspekt Pustki, a Zmienna Postać kopiuje pewny strzał Strzelca', () => {
    expect(domainAspect(9)).toBe('void');
    expect(domainAspect(10)).toBeNull();
    expect(portalDomain(9)?.god).toBe('Nyarlathotep');
    expect(portalDomain(9)?.modifier).toBe('shapeshift');
    expect(portalDomain(9)?.units).toHaveLength(10);
    expect(portalDomain(10)).toBeUndefined();
    const enemy = {
      stats: { strength: 80, defense: 80, accuracy: 1, evasion: 100 },
      life: 5_000,
      damage: 10,
      dread: 0,
      gaze: false,
    };
    for (let seed = 0; seed < 40; seed += 1) {
      const fight = simulateCombat(player('marksman'), enemy, `shape-${seed}`, 'shapeshift');
      const firstEnemy = fight.events.find((event) => event.actor === 'enemy' && event.round > 0);
      expect(firstEnemy?.kind === 'miss').toBe(false);
      expect(fight.events.some((event) => event.kind === 'shape')).toBe(true);
    }
    const plain = simulateCombat(player('marksman'), enemy, 'plain-shape', undefined);
    const again = simulateCombat(player('marksman'), enemy, 'plain-shape', undefined);
    expect(plain.events).toEqual(again.events);
  });
});
