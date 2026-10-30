import { describe, expect, it } from 'vitest';

import { simulateCombat, type PlayerCombatant } from '../src/combat.js';
import { cluePath, generateCase, leaksCaseSecret, publicCase } from '../src/investigation.js';
import {
  AWAKENING_GROWTH,
  CUTTER_COST,
  LODGE_ACTIONS,
  LODGE_ROLES,
  SUMMON_SIGNUP_MS,
  awakeningDomain,
  awakeningMaterialBonus,
  awakeningReceipts,
  awakeningStat,
  awakeningWeekStart,
  calmSanityBonus,
  keyRingBonus,
  lodgeAllows,
  lodgeLevel,
  lodgeXp,
  scrollCost,
  scrollSigils,
  voyageOutcome,
} from '../src/lodge.js';
import { tradableGood } from '../src/market.js';
import { KEY_REGEN_INTERVAL_MS, KEY_RING_CAP, materializeKeyRing } from '../src/portal.js';

describe('Loże i Przebudzenie', () => {
  it('macierz ról: Mistrz może wszystko, Nowicjusz tylko darowiznę', () => {
    for (const action of LODGE_ACTIONS) {
      expect(lodgeAllows('master', action)).toBe(true);
    }
    expect(lodgeAllows('elder', 'buyScroll')).toBe(true);
    expect(lodgeAllows('elder', 'withdraw')).toBe(false);
    expect(lodgeAllows('elder', 'learnSkill')).toBe(false);
    expect(lodgeAllows('treasurer', 'withdraw')).toBe(true);
    expect(lodgeAllows('treasurer', 'buyScroll')).toBe(false);
    expect(lodgeAllows('sibling', 'signup')).toBe(true);
    expect(lodgeAllows('sibling', 'withdraw')).toBe(false);
    expect(lodgeAllows('novice', 'donate')).toBe(true);
    expect(lodgeAllows('novice', 'signup')).toBe(false);
    expect(LODGE_ROLES).toHaveLength(5);
  });

  it('Zwój I kosztuje 50 000, a każdy stopień podwaja cenę i Sigile', () => {
    expect(scrollCost(1)).toBe(50_000);
    expect(scrollCost(2)).toBe(100_000);
    expect(scrollCost(3)).toBe(200_000);
    expect(scrollSigils(1)).toBe(1);
    expect(scrollSigils(3)).toBe(3);
    expect(SUMMON_SIGNUP_MS).toBe(30 * 60_000);
    expect(CUTTER_COST).toBe(20_000);
  });

  it('XP loży bierze 2% doświadczenia członków i darowizny', () => {
    expect(lodgeXp(1_000, 10_000)).toBe(1_200);
    expect(lodgeLevel(0)).toBe(1);
    expect(lodgeLevel(10_000)).toBe(2);
    expect(keyRingBonus(['keykeeper'])).toBe(1);
    expect(keyRingBonus(['fleet'])).toBe(0);
  });

  it('Pęk z Klucznikiem regeneruje do 7', () => {
    const ring = { regenKeys: 0, regenUpdatedAt: 0, lootKeys: 0, shards: 0 };
    expect(materializeKeyRing(ring, 7 * KEY_REGEN_INTERVAL_MS, KEY_RING_CAP + 1).regenKeys).toBe(7);
    expect(materializeKeyRing(ring, 7 * KEY_REGEN_INTERVAL_MS).regenKeys).toBe(KEY_RING_CAP);
  });

  it('Przebudzenie zmienia Domenę co tydzień i płaci ranking raz w liczbach', () => {
    const first = awakeningWeekStart(Date.UTC(2026, 9, 29, 12));
    const next = awakeningWeekStart(Date.UTC(2026, 10, 5, 12));
    expect(first < next).toBe(true);
    expect(awakeningDomain(first)).not.toBe(awakeningDomain(next));
    expect(awakeningDomain(first)).toBe(awakeningDomain(first));
    expect(awakeningStat(100, 1)).toBe(Math.round(100 * AWAKENING_GROWTH));
    expect(awakeningReceipts(1)).toBe(3);
    expect(awakeningReceipts(10)).toBe(1);
    expect(awakeningReceipts(11)).toBe(0);
    expect(awakeningMaterialBonus(Date.UTC(2026, 9, 26), awakeningDomain(first), 0)).toBe(true);
  });

  it('Żółty Znak podnosi obrażenia przy niskiej Poczytalności i nie rusza zwykłej walki', () => {
    const player: PlayerCombatant = {
      level: 20,
      stats: { strength: 80, defense: 80, accuracy: 200, evasion: 10 },
      life: 200,
      maxLife: 200,
      sanity: 10,
      maxSanity: 100,
      classId: null,
      weaponDamage: 30,
      knowledge: 0,
      panicImmune: true,
    };
    const enemy = {
      stats: { strength: 5, defense: 5, accuracy: 5, evasion: 1 },
      life: 50_000,
      damage: 1,
      dread: 0,
      gaze: false,
    };
    const plain = simulateCombat(player, enemy, 'znak');
    const marked = simulateCombat(player, enemy, 'znak', 'yellow-sign');
    const damageOf = (log: typeof plain) =>
      log.events.find((event) => event.actor === 'player' && event.damage > 0)?.damage ?? 0;
    expect(damageOf(marked)).toBeGreaterThan(damageOf(plain));
    const calm = simulateCombat({ ...player, sanity: 100 }, enemy, 'znak');
    const calmMarked = simulateCombat({ ...player, sanity: 100 }, enemy, 'znak', 'yellow-sign');
    expect(damageOf(calmMarked)).toBe(damageOf(calm));
  });

  it('Spisek jest rozwiązywalny i nie zdradza rozwiązania', () => {
    const blueprint = generateCase('conspiracy:loza');
    expect(blueprint.scale).toBe('conspiracy');
    expect(cluePath(blueprint)).toHaveLength(3);
    expect(leaksCaseSecret(publicCase(blueprint, [], 100))).toBe(false);
  });

  it('Strzęp Żółtego Płaszcza wchodzi na giełdę, Sigil nie', () => {
    expect(tradableGood('material:yellow-shred')).toBe(true);
    expect(tradableGood('sigil:6')).toBe(false);
  });

  it('Coś Większego przy trzech zapisanych zostawia połów, a cięcie sieci go zabiera', () => {
    let bigger = false;
    for (let i = 0; i < 200 && !bigger; i++) {
      const outcome = voyageOutcome(`rejs-${i}`, 3);
      if (outcome.bigger) {
        bigger = true;
        expect(outcome.fought).toBe(true);
        expect(outcome.catch).toBe(6);
      }
    }
    expect(bigger).toBe(true);
    const cut = voyageOutcome('pusto', 1);
    if (cut.bigger) expect(cut.catch).toBe(0);
  });

  it('Spokojny sen dodaje 20% regeneracji Poczytalności, nie więcej niż 12 h', () => {
    expect(calmSanityBonus(12 * 60 * 60_000)).toBe(7);
    expect(calmSanityBonus(24 * 60 * 60_000)).toBe(7);
  });
});
