import { z } from 'zod';

import {
  CALENDAR_MILESTONES,
  CIRCLES,
  EQUIPMENT_SLOTS,
  MAX_TIER_THIS_STAGE,
  MISSION_TIERS,
  SET_CLASS_IDS,
  TOP_CIRCLE_THIS_STAGE,
} from '../balance.js';
import { CALENDAR_MILESTONE_REWARDS, DAILY_TASKS, DAILY_TASK_KINDS } from './daily.js';
import { ENEMIES, type EnemyDef } from './enemies.js';
import { ITEMS, findItem, type ItemDef } from './items.js';
import { MISSIONS, MISSION_KINDS, type MissionDef } from './missions.js';

export * from './daily.js';
export * from './enemies.js';
export * from './items.js';
export * from './missions.js';
export * from './portal.js';

/** Wersja danych statycznych — rośnie przy każdej zmianie plików w `data/`. */
export const STATIC_DATA_VERSION = 10;

/**
 * Waluty obecne w grze (GDD 4.2). `bank` to srebro zdeponowane w Kasie — odporne
 * na Szabrowników (GDD 5.15). Kolejne (Kwity, Pieczęcie…) dochodzą z systemami.
 */
export const CURRENCIES = ['silver', 'bank', 'pearls', 'wax', 'vouchers'] as const;
export type Currency = (typeof CURRENCIES)[number];

const idPattern = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const tierIds = MISSION_TIERS.map((tier) => tier.id) as [string, ...string[]];

const missionDefSchema = z.object({
  id: z.string().regex(idPattern, 'Identyfikator w formacie „grupa.nazwa”'),
  kind: z.enum(MISSION_KINDS),
  name: z.string().min(1),
  description: z.string().min(1),
  tierId: z.enum(tierIds),
  successTexts: z.array(z.string().min(1)).min(1),
  failureTexts: z.array(z.string().min(1)).min(1),
});

const enemyDefSchema = z.object({
  id: z.string().regex(idPattern),
  name: z.string().min(1),
  description: z.string().min(1),
  circle: z.int().min(0).max(9),
  named: z.boolean(),
  dread: z.int().min(0).max(10),
  gaze: z.boolean(),
});

export interface StaticData {
  missions: readonly MissionDef[];
  enemies: readonly EnemyDef[];
  items: readonly ItemDef[];
}

function assertUnique(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Zduplikowany identyfikator (${label}): ${id}`);
    seen.add(id);
  }
}

/** Sprawdza spójność danych statycznych; serwer wywołuje to przy starcie i odmawia uruchomienia przy błędzie. */
export function validateStaticData(
  data: StaticData = { missions: MISSIONS, enemies: ENEMIES, items: ITEMS },
): void {
  z.array(missionDefSchema).parse(data.missions);
  z.array(enemyDefSchema).parse(data.enemies);
  assertUnique(
    data.missions.map((mission) => mission.id),
    'zlecenie',
  );
  assertUnique(
    data.enemies.map((enemy) => enemy.id),
    'wróg',
  );
  assertUnique(
    data.items.map((item) => item.id),
    'przedmiot',
  );

  for (const kind of MISSION_KINDS) {
    for (const tier of MISSION_TIERS) {
      const count = data.missions.filter(
        (mission) => mission.kind === kind && mission.tierId === tier.id,
      ).length;
      if (count !== 1) throw new Error(`Brak zlecenia (lub więcej niż jedno): ${kind}/${tier.id}`);
    }
  }

  for (const circle of CIRCLES.filter((c) => c.circle >= TOP_CIRCLE_THIS_STAGE)) {
    for (const named of [false, true]) {
      const pool = data.enemies.filter((e) => e.circle === circle.circle && e.named === named);
      if (pool.length === 0) {
        throw new Error(
          `Krąg ${circle.numeral} nie ma wrogów (${named ? 'nazwanych' : 'losowych'})`,
        );
      }
    }
    if (!data.items.some((item) => item.kind === 'junk' && item.circle === circle.circle)) {
      throw new Error(`Krąg ${circle.numeral} nie ma łupu-śmieci`);
    }
  }

  for (const classId of SET_CLASS_IDS) {
    for (const slot of EQUIPMENT_SLOTS) {
      if (slot === 'accessory' || slot === 'talisman') continue;
      for (let tier = 1; tier <= MAX_TIER_THIS_STAGE; tier++) {
        const id = `gear.${classId}.${slot}.${tier}`;
        if (!data.items.some((item) => item.id === id)) throw new Error(`Brak przedmiotu ${id}`);
      }
    }
  }

  if (new Set(DAILY_TASKS.map((task) => task.kind)).size !== DAILY_TASK_KINDS.length) {
    throw new Error('Pula dziennych zadań musi zawierać każdy rodzaj dokładnie raz');
  }
  const milestoneDays = CALENDAR_MILESTONE_REWARDS.map((reward) => reward.day);
  if (milestoneDays.join(',') !== CALENDAR_MILESTONES.join(',')) {
    throw new Error('Nagrody Kalendarza nie pokrywają się z kamieniami milowymi');
  }
  for (const reward of CALENDAR_MILESTONE_REWARDS) {
    for (const item of reward.items) {
      if (!findItem(item.itemId))
        throw new Error(`Nieznany przedmiot w Kalendarzu: ${item.itemId}`);
    }
  }
}
