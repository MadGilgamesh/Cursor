import { describe, expect, it } from 'vitest';

import { composureWithClass } from '../src/balance.js';
import { simulateCombat, type PlayerCombatant } from '../src/combat.js';
import {
  ASSIST_ORDER_REPUTATION,
  BETRAYAL_THRESHOLD_BP,
  OBSTACLE_LOOT_LOSS_BP,
  basePool,
  betrayalLoot,
  entrySilver,
  escortSanityLoss,
  expeditionOpen,
  findExpedition,
  halvedByEscort,
  lootAfterObstacles,
  missedObstacles,
  resolveExpedition,
  sharedSanity,
} from '../src/expedition.js';
import { godEchoForClear, portalDomain } from '../src/data/portal.js';
import { portalModifier, wellContaminationTenths, wellFightDread } from '../src/portal.js';
import { createRng } from '../src/rng.js';
import { isWolfHour, tideAt } from '../src/world.js';

describe('Wyprawy — tabela łupu i snapshot klas', () => {
  it('każda pominięta przeszkoda zabiera 15% puli bazowej', () => {
    const pool = basePool(12, 3);
    expect(pool).toBe(3_600);
    expect(lootAfterObstacles(pool, 0)).toBe(3_600);
    expect(lootAfterObstacles(pool, 1)).toBe(
      3_600 - Math.floor((3_600 * OBSTACLE_LOOT_LOSS_BP) / 10_000),
    );
    expect(lootAfterObstacles(pool, 3)).toBe(1_980);
    expect(lootAfterObstacles(pool, 4)).toBe(1_440);
  });

  it('snapshot klas nie patrzy na późniejszy sprzęt — liczy się tylko przekazany zestaw', () => {
    const atStart = missedObstacles(['butcher', null, null]);
    const afterGearChange = missedObstacles(['vagrant', 'occultist', 'marksman']);
    expect(atStart.map((obstacle) => obstacle.classId)).toEqual([
      'marksman',
      'occultist',
      'alienist',
    ]);
    expect(afterGearChange).toHaveLength(2);
    const resolved = resolveExpedition(
      findExpedition('canals')!,
      [
        {
          characterId: 'a',
          name: 'A',
          classId: 'butcher',
          assist: false,
          sanity: 80,
          maxSanity: 100,
        },
        { characterId: 'b', name: 'B', classId: null, assist: false, sanity: 80, maxSanity: 100 },
        { characterId: 'c', name: 'C', classId: null, assist: false, sanity: 80, maxSanity: 100 },
      ],
      createRng('kanały'),
    );
    expect(resolved.missed).toBe(3);
    expect(resolved.loot).toBe(1_980);
    expect(resolved.betrayerId).toBeNull();
  });

  it('wspólna pula poniżej 25% daje Zdradę i 80% łupu', () => {
    const members = [
      {
        characterId: 'a',
        name: 'Iskra',
        classId: 'butcher' as const,
        assist: false,
        sanity: 10,
        maxSanity: 100,
      },
      {
        characterId: 'b',
        name: 'Mgła',
        classId: 'marksman' as const,
        assist: false,
        sanity: 10,
        maxSanity: 100,
      },
      {
        characterId: 'c',
        name: 'Sól',
        classId: 'occultist' as const,
        assist: false,
        sanity: 10,
        maxSanity: 100,
      },
    ];
    expect(sharedSanity(members.map((member) => member.sanity))).toBe(10);
    expect(10 * 10_000 < 100 * BETRAYAL_THRESHOLD_BP).toBe(true);
    const resolved = resolveExpedition(findExpedition('canals')!, members, createRng('zdrada'));
    expect(resolved.missed).toBe(1);
    expect(resolved.shared).toBe(5);
    expect(resolved.betrayerId).not.toBeNull();
    expect(resolved.loot).toBe(betrayalLoot(lootAfterObstacles(3_600, 1)));
    expect(resolved.log.some((line) => line.includes('słyszy Śpiącego'))).toBe(true);
  });

  it('Alienista leczy pulę przed progiem Zdrady', () => {
    const resolved = resolveExpedition(
      findExpedition('canals')!,
      [
        {
          characterId: 'a',
          name: 'Lekarz',
          classId: 'alienist',
          assist: false,
          sanity: 30,
          maxSanity: 100,
        },
        {
          characterId: 'b',
          name: 'Rzeźnik',
          classId: 'butcher',
          assist: false,
          sanity: 30,
          maxSanity: 100,
        },
        {
          characterId: 'c',
          name: 'Strzelec',
          classId: 'marksman',
          assist: false,
          sanity: 30,
          maxSanity: 100,
        },
      ],
      createRng('lekarz'),
    );
    expect(resolved.missed).toBe(1);
    expect(resolved.shared).toBe(33);
    expect(resolved.betrayerId).toBeNull();
  });

  it('okna: zawsze, przypływ, noc i weekend', () => {
    const friday = Date.UTC(2026, 9, 30, 12, 0, 0);
    const monday = Date.UTC(2026, 9, 26, 12, 0, 0);
    expect(expeditionOpen('always', monday)).toBe(true);
    expect(expeditionOpen('weekend', friday)).toBe(true);
    expect(expeditionOpen('weekend', monday)).toBe(false);
    expect(expeditionOpen('tide', friday)).toBe(tideAt(friday) === 'high');
    expect(expeditionOpen('night', friday)).toBe(isWolfHour(friday));
    const night = friday - (friday % (4 * 60 * 60 * 1000)) + 3 * 60 * 60 * 1000 + 1_000;
    expect(isWolfHour(night)).toBe(true);
    expect(expeditionOpen('night', night)).toBe(true);
    expect(expeditionOpen('night', night - 2 * 60 * 60 * 1000)).toBe(false);
  });

  it('eskorcie obcina szansę i pierwszą utratę Poczytalności o 30%', () => {
    expect(halvedByEscort(1_000, false)).toBe(1_000);
    expect(halvedByEscort(1_000, true)).toBe(500);
    expect(halvedByEscort(501, true)).toBe(250);
    expect(escortSanityLoss(2, false)).toBe(2);
    expect(escortSanityLoss(2, true)).toBe(1);
    expect(ASSIST_ORDER_REPUTATION).toBe(10);
    expect(entrySilver(12)).toBe(600);
  });
});

describe("Alienista, Studnia i Sny R'lyeh", () => {
  it('Alienista dodaje 30% Opanowania, inne klasy nie ruszają liczby', () => {
    expect(composureWithClass(100, 'alienist')).toBe(130);
    expect(composureWithClass(0, 'alienist')).toBe(0);
    expect(composureWithClass(100, 'butcher')).toBe(100);
    expect(composureWithClass(100, null)).toBe(100);
  });

  it('od piętra 50 są 2 dziesiąte Skażenia, od 70 Groza co najmniej 6', () => {
    expect(wellContaminationTenths(49)).toBe(0);
    expect(wellContaminationTenths(50)).toBe(2);
    expect(wellFightDread(69, false, false)).toBe(1);
    expect(wellFightDread(69, true, false)).toBe(4);
    expect(wellFightDread(70, false, false)).toBe(6);
    expect(wellFightDread(80, true, false)).toBe(6);
    expect(wellFightDread(90, true, true)).toBe(0);
  });

  it("Sny R'lyeh zabierają Poczytalność co rundę i zakrzywiają część ciosów", () => {
    const player: PlayerCombatant = {
      level: 20,
      stats: { strength: 80, defense: 80, accuracy: 200, evasion: 10 },
      life: 2_000,
      maxLife: 2_000,
      sanity: 100,
      maxSanity: 100,
      classId: 'marksman',
      weaponDamage: 40,
      knowledge: 0,
      panicImmune: true,
    };
    const enemy = {
      stats: { strength: 1, defense: 1, accuracy: 1, evasion: 1 },
      life: 100_000,
      damage: 1,
      dread: 0,
      gaze: false,
    };
    const plain = simulateCombat(player, enemy, 'rlyeh-tozsamosc');
    const again = simulateCombat(player, enemy, 'rlyeh-tozsamosc');
    expect(again.events).toEqual(plain.events);
    expect(plain.events.some((event) => event.kind === 'dream')).toBe(false);
    const dreaming = simulateCombat(player, enemy, 'rlyeh-tozsamosc', 'rlyeh-dreams');
    const dreams = dreaming.events.filter((event) => event.kind === 'dream');
    expect(dreams).toHaveLength(dreaming.rounds);
    expect(dreaming.sanityEnd).toBe(100 - dreaming.rounds);
    let curved = 0;
    for (let index = 0; index < 400; index += 1) {
      const log = simulateCombat(player, enemy, `rlyeh-${index}`, 'rlyeh-dreams');
      const first = log.events.find((event) => event.actor === 'player' && event.round === 1);
      if (first?.kind === 'miss') curved += 1;
      const plainFirst = simulateCombat(player, enemy, `rlyeh-${index}`).events.find(
        (event) => event.actor === 'player' && event.round === 1,
      );
      expect(plainFirst?.kind).not.toBe('miss');
    }
    expect(curved / 400).toBeGreaterThan(0.05);
    expect(curved / 400).toBeLessThan(0.16);
  });

  it('Domena 8 to Cthulhu, a echo boga pada na etapie 5 i 9', () => {
    expect(portalModifier(8)).toBe('rlyeh-dreams');
    expect(portalModifier(9)).toBeNull();
    expect(portalDomain(8)?.units[4]).toBe('Strażnicy Monolitów');
    expect(portalDomain(8)?.units[9]).toBe('Cthulhu Przebudzony');
    expect(godEchoForClear(8, 5, 8)?.id).toBe('echo.god.cthulhu.wraith');
    expect(godEchoForClear(8, 9, 8)?.id).toBe('echo.god.cthulhu.phantom');
    expect(godEchoForClear(8, 8, 8)).toBeUndefined();
  });
});
