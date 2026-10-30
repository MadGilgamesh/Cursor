import { describe, expect, it } from 'vitest';

import { simulateCombat, type PlayerCombatant } from '../src/combat.js';
import {
  HOUSES,
  MUTATIONS,
  RITUAL_CATEGORIES,
  SEAL_DOUBLE_BP,
  aspectEdge,
  bedroomVigorBp,
  cultRankFor,
  domainAspect,
  domainContaminationTenths,
  houseSellValue,
  houseUpkeepDays,
  isOathWindow,
  missingMaterial,
  nextCircle,
  oathEffectiveAt,
  offerMutations,
  ritualChance,
  ritualWeightBp,
  rollRitual,
  rollWound,
  sealSigilCount,
  settleUpkeep,
  tomeKnowledgeGain,
} from '../src/hearth.js';
import { createRng } from '../src/rng.js';

const fighter: PlayerCombatant = {
  level: 10,
  stats: { strength: 20, defense: 40, accuracy: 40, evasion: 1 },
  life: 50_000,
  maxLife: 50_000,
  sanity: 80,
  maxSanity: 100,
  classId: null,
  weaponDamage: 5,
  knowledge: 0,
  panicImmune: true,
};

const beast = {
  stats: { strength: 30, defense: 80, accuracy: 400, evasion: 1 },
  life: 5_000_000,
  damage: 12,
  dread: 0,
  gaze: false,
};

describe('Dom, rytuały i Domena 7', () => {
  it('krawędź aspektu idzie cyklem, a Domena 7 jest znowu Rojem', () => {
    expect(aspectEdge('depth', 'flame')).toBe(1.2);
    expect(aspectEdge('flame', 'depth')).toBe(0.8);
    expect(aspectEdge('pale', 'depth')).toBe(1.2);
    expect(aspectEdge('depth', 'pale')).toBe(0.8);
    expect(aspectEdge('depth', 'depth')).toBe(1);
    expect(aspectEdge('depth', 'swarm')).toBe(1);
    expect(domainAspect(1)).toBe('swarm');
    expect(domainAspect(2)).toBe('depth');
    expect(domainAspect(6)).toBe('gale');
    expect(domainAspect(7)).toBe('swarm');
    expect(domainAspect(8)).toBe('depth');
    expect(domainAspect(9)).toBe('void');
    expect(domainAspect(10)).toBeNull();
    expect(domainAspect(11)).toBeNull();
    expect(domainContaminationTenths(6)).toBe(0);
    expect(domainContaminationTenths(7)).toBe(1);
  });

  it('Przysięga tylko w poniedziałek, a skutek od wtorku', () => {
    const monday = Date.UTC(2026, 9, 26, 15);
    expect(isOathWindow(monday)).toBe(true);
    expect(isOathWindow(Date.UTC(2026, 9, 27, 0))).toBe(false);
    expect(oathEffectiveAt(monday)).toBe(Date.UTC(2026, 9, 27));
    expect(nextCircle(false, 4)).toBe(1);
    expect(nextCircle(true, 4)).toBe(5);
    expect(nextCircle(true, 5)).toBe(5);
  });

  it('utrzymanie, sprzedaż i brakujący materiał', () => {
    expect(HOUSES).toHaveLength(5);
    expect(houseSellValue(5_000)).toBe(3_500);
    expect(missingMaterial({ wood: 10 }, { wood: 60 })).toBe('wood');
    expect(missingMaterial({ wood: 60 }, { wood: 60 })).toBeNull();
    expect(houseUpkeepDays(null, '2026-10-30')).toBe(1);
    expect(houseUpkeepDays('2026-10-30', '2026-10-30')).toBe(0);
    expect(houseUpkeepDays('2026-10-28', '2026-10-30')).toBe(2);
    expect(settleUpkeep(15, 3, 20)).toEqual({ paidDays: 1, spent: 15, arrears: true });
    expect(settleUpkeep(15, 0, 100)).toEqual({ paidDays: 0, spent: 0, arrears: false });
    expect(bedroomVigorBp(1, false)).toBe(500);
    expect(bedroomVigorBp(1, true)).toBe(0);
    expect(bedroomVigorBp(0, false)).toBe(0);
  });

  it('przy p = 0,5 wagi rytuału to 4000/1000/4250/750, a rozkład przechodzi chi-kwadrat', () => {
    expect(RITUAL_CATEGORIES).toHaveLength(6);
    expect(ritualChance(0, 0, 0, 50, 100)).toBeCloseTo(0.5);
    expect(ritualChance(100, 0, 5, 100, 100)).toBe(0.95);
    expect(ritualChance(0, 100, 0, 0, 100)).toBe(0.15);
    const weights = ritualWeightBp(0.5);
    expect(weights.map((entry) => entry.weight)).toEqual([4_000, 1_000, 4_250, 750]);
    const trials = 1_000_000;
    const counts = { success: 0, priced: 0, failure: 0, disaster: 0 };
    for (let index = 0; index < trials; index += 1) {
      counts[rollRitual(createRng(`rytual:${index}`), 0.5)] += 1;
    }
    let chi = 0;
    for (const entry of weights) {
      const expected = (entry.weight / 10_000) * trials;
      const observed = counts[entry.item];
      chi += (observed - expected) ** 2 / expected;
    }
    expect(chi).toBeLessThan(25);
  });

  it('Pieczęć daje drugi Sigil w 20% rzutów', () => {
    expect(sealSigilCount(false)).toBe(1);
    expect(sealSigilCount(true)).toBe(2);
    const trials = 100_000;
    let doubles = 0;
    for (let index = 0; index < trials; index += 1) {
      if (createRng(`pieczec:${index}`).rollBp(SEAL_DOUBLE_BP)) doubles += 1;
    }
    expect(doubles / trials).toBeGreaterThan(0.19);
    expect(doubles / trials).toBeLessThan(0.21);
  });

  it('wiedza z tomu przy zerze jest pełna, a oferta mutacji ma trzy sztuki', () => {
    expect(tomeKnowledgeGain(2, 0)).toBe(2);
    expect(tomeKnowledgeGain(2, 50)).toBe(1);
    expect(tomeKnowledgeGain(2, 100)).toBe(0);
    const offer = offerMutations(createRng('mutacja'), []);
    expect(offer).toHaveLength(3);
    expect(new Set(offer).size).toBe(3);
    expect(offer.every((id) => MUTATIONS.some((mutation) => mutation.id === id))).toBe(true);
    const again = offerMutations(createRng('mutacja'), offer);
    expect(again.every((id) => !offer.includes(id))).toBe(true);
  });

  it('ranga kultu i rana: 15%, oko dopiero przy Grozie 8', () => {
    expect(cultRankFor(0)).toBe('listener');
    expect(cultRankFor(3)).toBe('acolyte');
    expect(cultRankFor(8)).toBe('priest');
    expect(cultRankFor(15)).toBe('hierophant');
    const trials = 20_000;
    let wounds = 0;
    let eyes = 0;
    for (let index = 0; index < trials; index += 1) {
      const roll = rollWound(createRng(`rana:${index}`), 3);
      if (!roll) continue;
      wounds += 1;
      if (roll.id === 'eye') eyes += 1;
    }
    expect(eyes).toBe(0);
    expect(wounds / trials).toBeGreaterThan(0.13);
    expect(wounds / trials).toBeLessThan(0.17);
    let highEyes = 0;
    for (let index = 0; index < trials; index += 1) {
      if (rollWound(createRng(`oko:${index}`), 8)?.id === 'eye') highEyes += 1;
    }
    expect(highEyes).toBeGreaterThan(0);
  });

  it('Płodność podnosi obrażenia wroga, a krawędź 1 nie zmienia logu', () => {
    const plain = simulateCombat(fighter, beast, 'plodnosc');
    const edged = simulateCombat(fighter, beast, 'plodnosc', undefined, 1);
    expect(edged.events).toEqual(plain.events);
    const brood = simulateCombat(fighter, beast, 'plodnosc', 'fertility');
    const taken = (log: typeof plain) =>
      log.events
        .filter((event) => event.actor === 'enemy' && event.damage > 0 && event.kind !== 'dread')
        .reduce((sum, event) => sum + event.damage, 0);
    expect(taken(brood)).toBeGreaterThan(taken(plain));
  });
});
