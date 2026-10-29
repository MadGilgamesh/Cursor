import { describe, expect, it } from 'vitest';

import { dreadSanityLoss } from '../src/balance.js';
import { simulateCombat, type PlayerCombatant } from '../src/combat.js';
import { ECHOES, SEANCE_ECHOES, portalDomain } from '../src/data/portal.js';
import {
  ECHO_RARITIES,
  ECHO_RARITY_WEIGHTS,
  KEY_REGEN_INTERVAL_MS,
  KEY_RING_CAP,
  KEY_SHARDS_PER_KEY,
  SEANCE_BEYOND_PITY,
  SEANCE_ECHO_WEIGHT,
  SEANCE_GEAR_WEIGHT,
  SEANCE_PITY_GUARANTEE,
  addKeyShards,
  engraverSilverCost,
  huntKeyShard,
  materializeKeyRing,
  missionKeyShards,
  portalAccess,
  portalAuraDread,
  portalBaseExperience,
  portalBaseSilver,
  portalEnemyDamage,
  portalEnemyLife,
  portalEnemyStat,
  portalEquivalentFloor,
  portalFightIndex,
  portalPayout,
  portalRecommendedLevel,
  rollSeance,
  spendDreamKey,
  wellWhisperPending,
} from '../src/portal.js';
import { createRng } from '../src/rng.js';

const ring = { regenKeys: 0, regenUpdatedAt: 0, lootKeys: 0, shards: 0 };

describe('Portal — piętro i tabela 10.13', () => {
  it('numeruje walki od 1 do 160 w Domenach 1–2', () => {
    expect(portalFightIndex({ domain: 1, stage: 1, substage: 1 })).toBe(1);
    expect(portalFightIndex({ domain: 1, stage: 10, substage: 8 })).toBe(80);
    expect(portalFightIndex({ domain: 2, stage: 1, substage: 1 })).toBe(81);
    expect(portalFightIndex({ domain: 2, stage: 10, substage: 8 })).toBe(160);
  });

  it('start Domeny 1 ma statystykę 29, a zaokrąglone f(80) = 21 daje wiersz tabeli', () => {
    const start = portalEquivalentFloor(1);
    expect(portalEnemyStat(start)).toBe(29);
    expect(Math.round(portalEquivalentFloor(80))).toBe(21);
    expect(portalEnemyStat(21)).toBe(3608);
    expect(portalEnemyLife(21)).toBe(480);
    expect(portalEnemyDamage(21)).toBe(33);
    expect(portalEquivalentFloor(880)).toBeGreaterThan(319);
    expect(portalEquivalentFloor(880)).toBeLessThan(322);
  });

  it('koniec Domeny 2 mieści się w 1% tabeli (f ≈ 46, statystyka 14 525, obrażenia 63)', () => {
    const floor = portalEquivalentFloor(160);
    expect(floor).toBeGreaterThan(45);
    expect(floor).toBeLessThan(47);
    expect(portalEnemyStat(floor)).toBeGreaterThan(14_525 * 0.99);
    expect(portalEnemyStat(floor)).toBeLessThan(14_525 * 1.01);
    expect(portalEnemyDamage(46)).toBe(63);
  });
});

describe('Portal — nagrody 10.13', () => {
  it('przy L10 daje 240 PD i 107 srebra, a pierwsze przejście ×3', () => {
    expect(portalBaseExperience(10)).toBe(240);
    expect(portalBaseSilver(10)).toBe(107);
    expect(engraverSilverCost(10)).toBe(107);
    const first = portalPayout({ domain: 1, stage: 1, substage: 1 }, true, true);
    const repeat = portalPayout({ domain: 1, stage: 1, substage: 1 }, false, true);
    expect(first.experience).toBe(repeat.experience * 3);
    expect(first.silver).toBe(repeat.silver * 3);
    expect(first.materials).toBe(repeat.materials);
  });

  it('porażka zwraca 10% PD podstawy i zero srebra', () => {
    const level = portalRecommendedLevel({ domain: 1, stage: 1, substage: 1 });
    const loss = portalPayout({ domain: 1, stage: 1, substage: 1 }, true, false);
    expect(loss.experience).toBe(Math.round(portalBaseExperience(level) * 0.1));
    expect(loss.silver).toBe(0);
    expect(loss.materials).toBe(0);
  });

  it('boss ma ×2, awatar ×5, a pierwsze zabicie awatara daje 3 Sigile następnego boga', () => {
    const boss = portalPayout({ domain: 1, stage: 1, substage: 8 }, false, true);
    const minion = portalPayout({ domain: 1, stage: 1, substage: 7 }, false, true);
    expect(boss.sigilShards).toBe(1);
    expect(minion.sigilShards).toBe(0);
    expect(boss.experience).toBeGreaterThan(minion.experience);
    const avatar = portalPayout({ domain: 1, stage: 10, substage: 8 }, true, true);
    expect(avatar.nextGodSigils).toBe(3);
    expect(avatar.materials).toBe(20);
  });

  it('Aura Bokruga ma Grozę 2,25 i zabiera 9 Poczytalności przy Opanowaniu 0', () => {
    expect(portalAuraDread(1)).toBeCloseTo(2.25);
    expect(dreadSanityLoss(portalAuraDread(1), 0)).toBe(9);
    expect(dreadSanityLoss(portalAuraDread(1), 100)).toBe(5);
  });
});

describe('Pęk Kluczy', () => {
  it('regeneruje 1 klucz na 4 h i staje na 6', () => {
    const one = materializeKeyRing(ring, KEY_REGEN_INTERVAL_MS);
    expect(one.regenKeys).toBe(1);
    const day = materializeKeyRing(ring, 24 * KEY_REGEN_INTERVAL_MS);
    expect(day.regenKeys).toBe(KEY_RING_CAP);
    const later = materializeKeyRing(day, day.regenUpdatedAt + KEY_REGEN_INTERVAL_MS);
    expect(later.regenKeys).toBe(KEY_RING_CAP);
  });

  it('po wydaniu klucza z pełnego Pęku następny tik znowu go uzupełnia', () => {
    const full = materializeKeyRing(ring, 6 * KEY_REGEN_INTERVAL_MS);
    const spent = spendDreamKey(full);
    expect(spent?.regenKeys).toBe(5);
    const again = materializeKeyRing(spent!, full.regenUpdatedAt + KEY_REGEN_INTERVAL_MS);
    expect(again.regenKeys).toBe(6);
  });

  it('5 Odłamków staje się kluczem z łupu, ponad limit Pęku', () => {
    const full = { ...ring, regenKeys: KEY_RING_CAP, shards: 4 };
    const next = addKeyShards(full, 1);
    expect(next.shards).toBe(0);
    expect(next.lootKeys).toBe(1);
    expect(next.regenKeys).toBe(KEY_RING_CAP);
    expect(addKeyShards(ring, KEY_SHARDS_PER_KEY + 2)).toMatchObject({ lootKeys: 1, shards: 2 });
  });

  it('nie da się pominąć podetapu ani wejść do Domeny 3', () => {
    const none = { domain: 0, stage: 0, substage: 0 };
    expect(portalAccess({ domain: 1, stage: 1, substage: 1 }, none)).toBe('first');
    expect(portalAccess({ domain: 1, stage: 1, substage: 2 }, none)).toBe('skip');
    const cleared = { domain: 2, stage: 10, substage: 8 };
    expect(portalAccess({ domain: 3, stage: 1, substage: 1 }, cleared)).toBe('locked');
    expect(portalAccess({ domain: 1, stage: 1, substage: 1 }, cleared)).toBe('repeat');
  });
});

describe('źródła Odłamków', () => {
  it('zlecenie 8 h daje odłamek, godzinne tylko przy trafieniu, krótkie nigdy', () => {
    expect(missionKeyShards('h8', true, false)).toBe(1);
    expect(missionKeyShards('h1', true, true)).toBe(1);
    expect(missionKeyShards('h1', true, false)).toBe(0);
    expect(missionKeyShards('h4', false, true)).toBe(0);
    expect(missionKeyShards('m5', true, true)).toBe(0);
  });

  it('nazwany z Kręgu V i niżej (trudniejszy) daje odłamek, Krąg VI nie', () => {
    expect(huntKeyShard(5, true, true)).toBe(1);
    expect(huntKeyShard(4, true, true)).toBe(1);
    expect(huntKeyShard(6, true, true)).toBe(0);
    expect(huntKeyShard(5, false, true)).toBe(0);
  });
});

describe('Studnia i modyfikatory', () => {
  it('po piętrze 5 Szept jest wymagany, po wyborze — nie', () => {
    expect(wellWhisperPending(5, 0)).toBe(true);
    expect(wellWhisperPending(5, 10)).toBe(false);
    expect(wellWhisperPending(4, 0)).toBe(false);
  });

  it('Zemsta Ib leczy wroga co 4. rundę', () => {
    const player = dummyPlayer();
    const enemy = dummyEnemy();
    const plain = simulateCombat(player, enemy, 'ib', undefined);
    const cursed = simulateCombat(player, enemy, 'ib', 'ib-vengeance');
    expect(cursed.events.some((event) => event.kind === 'heal')).toBe(true);
    expect(plain.events.some((event) => event.kind === 'heal')).toBe(false);
  });

  it('Ciśnienie zmienia dziennik walki przy tym samym ziarnie', () => {
    const player = dummyPlayer();
    const enemy = { ...dummyEnemy(), life: 100_000 };
    let differed = 0;
    for (let i = 0; i < 20; i++) {
      const plain = simulateCombat(player, enemy, `cisnienie-${i}`);
      const pressed = simulateCombat(player, enemy, `cisnienie-${i}`, 'pressure');
      const signature = (log: typeof plain) => log.events.map((event) => event.kind).join('');
      if (signature(plain) !== signature(pressed)) differed += 1;
    }
    expect(differed).toBeGreaterThan(0);
  });
});

describe('Seanse (GDD 10.8)', () => {
  it('rozkład miliona losowań zgadza się z tabelą (chi-kwadrat)', () => {
    const rng = createRng('seans-chi');
    const outcomes = { echo: 0, gear: 0, consumable: 0 };
    const rarities = { whisper: 0, apparition: 0, wraith: 0, phantom: 0, beyond: 0 };
    const n = 1_000_000;
    for (let i = 0; i < n; i++) {
      const roll = rollSeance(rng, 0, 0);
      outcomes[roll.outcome] += 1;
      if (roll.rarity) rarities[roll.rarity] += 1;
    }
    const outcomeChi = chiSquare(
      [outcomes.echo, outcomes.gear, outcomes.consumable],
      [SEANCE_ECHO_WEIGHT, SEANCE_GEAR_WEIGHT, 30],
      n,
    );
    expect(outcomeChi).toBeLessThan(25);
    const echoN = outcomes.echo;
    const weights = ECHO_RARITIES.map((rarity) => ECHO_RARITY_WEIGHTS[rarity]);
    const rarityChi = chiSquare(
      ECHO_RARITIES.map((rarity) => rarities[rarity]),
      weights,
      echoN,
    );
    expect(rarityChi).toBeLessThan(25);
  });

  it('80. Seans bez Widma gwarantuje Widmo albo coś rzadszego', () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollSeance(createRng(`litość-${i}`), SEANCE_PITY_GUARANTEE - 1, 0);
      if (roll.outcome !== 'echo') continue;
      expect(roll.rarity === 'phantom' || roll.rarity === 'beyond').toBe(true);
      expect(roll.dry).toBe(0);
    }
  });

  it('300. Seans bez Spoza Gwiazd, gdy wypada Echo, daje Spoza Gwiazd', () => {
    const roll = rollSeance(createRng('poza'), 0, SEANCE_BEYOND_PITY - 1);
    // Wynik Echo nie jest gwarantowany — powtarzamy ziarna, aż trafi się Echo.
    let found = roll.outcome === 'echo' ? roll : null;
    for (let i = 0; !found && i < 50; i++) {
      const next = rollSeance(createRng(`poza-${i}`), 0, SEANCE_BEYOND_PITY - 1);
      if (next.outcome === 'echo') found = next;
    }
    expect(found?.rarity).toBe('beyond');
  });

  it('katalog ma 30 Ech do Widma i po dwa Echa bogów Domen 1–2', () => {
    expect(SEANCE_ECHOES).toHaveLength(30);
    expect(SEANCE_ECHOES.every((echo) => echo.rarity !== 'beyond')).toBe(true);
    expect(ECHOES.filter((echo) => echo.godDomain === 1)).toHaveLength(2);
    expect(portalDomain(1)?.modifier).toBe('ib-vengeance');
    expect(portalDomain(2)?.modifier).toBe('pressure');
  });
});

function chiSquare(observed: number[], weights: number[], total: number): number {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  return observed.reduce((sum, value, index) => {
    const expected = (total * weights[index]!) / weightSum;
    return sum + (value - expected) ** 2 / expected;
  }, 0);
}

function dummyPlayer(): PlayerCombatant {
  return {
    level: 10,
    stats: { strength: 40, defense: 40, accuracy: 40, evasion: 80 },
    life: 400,
    maxLife: 400,
    sanity: 100,
    maxSanity: 100,
    classId: 'butcher',
    weaponDamage: 36,
    knowledge: 0,
  };
}

function dummyEnemy() {
  return {
    stats: { strength: 30, defense: 30, accuracy: 40, evasion: 20 },
    life: 200,
    damage: 12,
    dread: 2,
    gaze: false,
  };
}
