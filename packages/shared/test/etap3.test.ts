import { describe, expect, it } from 'vitest';

import { resourceMax, sanityTier } from '../src/balance.js';
import { simulateCombat } from '../src/combat.js';
import { cluePath, generateCase, leaksCaseSecret, publicCase } from '../src/investigation.js';
import {
  advanceCalendar,
  bestiaryPages,
  bestiarySigilUnlock,
  capReputation,
  DOMAIN_BOOK_KNOWLEDGE,
  reforgeIchorCost,
  REFORGE_DAILY_CAP,
  sanityPenaltyForScars,
} from '../src/lore.js';
import {
  portalEnemyDamage,
  portalEnemyLife,
  portalEnemyStat,
  portalSigilRequired,
  portalStarAccess,
  unlockedPortalGods,
} from '../src/portal.js';

describe('Etap 3 — Wiedza, Sprawy, Sigile', () => {
  it('max Poczytalności spada o 0,75 za punkt Wiedzy i o Bliznę głosu', () => {
    expect(resourceMax('sanity', { level: 1, knowledge: 0 })).toBe(100);
    expect(resourceMax('sanity', { level: 1, knowledge: 80 })).toBe(40);
    expect(
      resourceMax('sanity', {
        level: 1,
        knowledge: 80,
        sanityPenalty: sanityPenaltyForScars(['voice']),
      }),
    ).toBe(35);
  });

  it('Krawędź jest osobno od Rozchwiania', () => {
    expect(sanityTier(100, 100)).toBe('calm');
    expect(sanityTier(60, 100)).toBe('uneasy');
    expect(sanityTier(30, 100)).toBe('shaken');
    expect(sanityTier(11, 100)).toBe('shaken');
    expect(sanityTier(10, 100)).toBe('edge');
    expect(sanityTier(1, 100)).toBe('edge');
    expect(sanityTier(0, 100)).toBe('broken');
  });

  it('tysiąc ziaren daje rozwiązywalną Sprawę, a widok publiczny nie zdradza rozwiązania', () => {
    for (let index = 0; index < 1_000; index += 1) {
      const blueprint = generateCase(`sprawa-${index}`);
      expect(cluePath(blueprint), `ziarno ${index}`).not.toBeNull();
      for (const id of ['who', 'where', 'intent'] as const) {
        expect(blueprint.options[id].length).toBeGreaterThanOrEqual(4);
        expect(blueprint.options[id].length).toBeLessThanOrEqual(6);
      }
      const visible = publicCase(blueprint, [], 100);
      expect(leaksCaseSecret(visible)).toBe(false);
      expect(
        visible.clues.some((clue) => clue.supports !== undefined || clue.narrowed !== undefined),
      ).toBe(false);
      const hidden = publicCase(blueprint, [], 100).clues.some((clue) =>
        clue.id.startsWith('hidden-'),
      );
      expect(hidden).toBe(false);
      const shaken = publicCase(blueprint, [], 30);
      expect(shaken.clues.some((clue) => clue.id.startsWith('hidden-'))).toBe(true);
    }
  });

  it('znaleziony trop odsłania tylko siebie', () => {
    const blueprint = generateCase('jeden-trop');
    const path = cluePath(blueprint);
    expect(path).not.toBeNull();
    const visible = publicCase(blueprint, [path![0]!], 100);
    const found = visible.clues.filter((clue) => clue.found);
    expect(found).toHaveLength(1);
    expect(found[0]?.supports).toBe(blueprint.solution[found[0]!.question]);
    expect(leaksCaseSecret(visible)).toBe(false);
  });

  it('Sigil jest wymagany od Etapu 6 Domeny 3 i na każdej gwiazdce', () => {
    expect(portalSigilRequired({ domain: 3, stage: 5, substage: 8 })).toBe(false);
    expect(portalSigilRequired({ domain: 3, stage: 6, substage: 1 })).toBe(true);
    expect(portalSigilRequired({ domain: 2, stage: 10, substage: 8 })).toBe(false);
    expect(portalSigilRequired({ domain: 1, stage: 1, substage: 1 }, 1)).toBe(true);
    expect(REFORGE_DAILY_CAP).toBe(5);
    expect(reforgeIchorCost(19)).toBe(1);
    expect(reforgeIchorCost(20)).toBe(0);
  });

  it('★1 mnoży statystyki przez 1,5, a Życie i obrażenia przez 1,25', () => {
    const floor = 10;
    const stat = 15 * floor ** 1.8 + 10;
    expect(portalEnemyStat(floor, 'minion', 1)).toBe(Math.round(stat * 1.5));
    expect(portalEnemyStat(floor)).toBe(Math.round(stat));
    const life = (60 + 20 * floor) * 1.5;
    expect(portalEnemyLife(floor, 'boss', 2)).toBe(Math.round(life * 1.25 ** 2));
    const damage = (8 + 1.2 * floor) * 1.3;
    expect(portalEnemyDamage(floor, 'avatar', 1)).toBe(Math.round(damage * 1.25));
  });

  it('★1 Bokruga otwiera się po awatarze, a ★2 dopiero po ★1', () => {
    const dream = { domain: 1, stage: 10, substage: 8 };
    const fresh = { cleared: 0, stage: 0, substage: 0 };
    expect(portalStarAccess({ domain: 1, stage: 1, substage: 1 }, 1, dream, fresh)).toBe('first');
    expect(portalStarAccess({ domain: 1, stage: 1, substage: 2 }, 1, dream, fresh)).toBe('skip');
    expect(portalStarAccess({ domain: 1, stage: 1, substage: 1 }, 2, dream, fresh)).toBe('locked');
    expect(
      portalStarAccess(
        { domain: 1, stage: 1, substage: 1 },
        1,
        { domain: 1, stage: 9, substage: 8 },
        fresh,
      ),
    ).toBe('locked');
    expect(unlockedPortalGods(dream)).toEqual([1, 2]);
  });

  it('Wysysanie Koloru zabiera Życie i Poczytalność co rundę', () => {
    const player = {
      level: 1,
      stats: { strength: 5, defense: 5, accuracy: 5, evasion: 5 },
      life: 100,
      maxLife: 100,
      sanity: 40,
      maxSanity: 100,
      classId: null,
      weaponDamage: 1,
      knowledge: 0,
    };
    const enemy = {
      stats: { strength: 1, defense: 1, accuracy: 1, evasion: 1 },
      life: 10_000,
      damage: 1,
      dread: 0,
      gaze: false,
    };
    const drained = simulateCombat(player, enemy, 'kolor', 'drain');
    expect(drained.events.some((event) => event.kind === 'drain')).toBe(true);
    expect(drained.sanityEnd).toBeLessThan(drained.sanityStart);
    const plain = simulateCombat(player, enemy, 'kolor');
    expect(plain.events.some((event) => event.kind === 'drain')).toBe(false);
  });

  it('Bestiariusz, Księgi Domen, frakcje i Kalendarz trzymają progi z GDD', () => {
    expect(bestiaryPages(9)).toBe(0);
    expect(bestiaryPages(10)).toBe(1);
    expect(bestiaryPages(1_000)).toBe(4);
    expect(bestiarySigilUnlock(999, 1_000)).toBe(true);
    expect(bestiarySigilUnlock(1_000, 1_001)).toBe(false);
    expect(DOMAIN_BOOK_KNOWLEDGE(1)).toBe(0);
    expect(DOMAIN_BOOK_KNOWLEDGE(3)).toBe(6);
    const blocked = capReputation('brotherhood', 2_000, { guard: 1_200, brotherhood: 0 });
    expect(blocked).toBeLessThan(1_200);
    const open = capReputation('brotherhood', 2_000, { guard: 600, brotherhood: 0 });
    expect(open).toBe(2_000);
    const started = advanceCalendar({ streak: 0, lastDay: null, claimed: [] }, '2026-01-01');
    expect(started.streak).toBe(1);
    const next = advanceCalendar(started, '2026-01-02');
    expect(next.streak).toBe(2);
    const broken = advanceCalendar(
      { streak: 10, lastDay: '2026-01-01', claimed: [7] },
      '2026-01-05',
    );
    expect(broken.streak).toBe(7);
  });
});
