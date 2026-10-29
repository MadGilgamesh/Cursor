/**
 * Stan postaci Etapu 1: statystyki, ekwipunek, klasa, blokady (Przytułek, Sanatorium).
 */
import {
  BREAKDOWN_EXIT_SANITY_BP,
  breakdownDurationMs,
  ERROR_CODES,
  MISSION_KIND_STAT,
  STARTING_STAT,
  STAT_SCALE,
  adjustResource,
  applyBp,
  computeLoadout,
  effectiveStatsCenti,
  hospitalDurationMs,
  missionChanceBp,
  resourceContextFor,
  resourceMax,
  statUnits,
  type ClassId,
  type CombatStat,
  type EquippedItem,
  type ItemRarity,
  type MissionDef,
  type StatBlock,
} from '@game/shared';
import { eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import { characterStats, itemInstances, type CharacterRow } from '../db/schema.js';
import { AppError } from '../errors.js';
import { maybeMindScar } from './lore-state.js';
import { loadResources, materializeAll, saveResources, type ResourceValues } from './resources.js';

export const startingStats = (): StatBlock => ({
  strength: STARTING_STAT * STAT_SCALE,
  defense: STARTING_STAT * STAT_SCALE,
  accuracy: STARTING_STAT * STAT_SCALE,
  evasion: STARTING_STAT * STAT_SCALE,
});

export async function insertStartingStats(db: Executor, characterId: string): Promise<void> {
  const stats = startingStats();
  await db.insert(characterStats).values({ characterId, ...stats });
}

export async function loadStats(db: Executor, characterId: string, forUpdate = false) {
  const query = db
    .select()
    .from(characterStats)
    .where(eq(characterStats.characterId, characterId))
    .limit(1);
  const [row] = forUpdate ? await query.for('update') : await query;
  if (!row) throw new Error(`Postać ${characterId} nie ma statystyk`);
  return row;
}

export function statBlock(row: {
  strength: number;
  defense: number;
  accuracy: number;
  evasion: number;
}): StatBlock {
  return {
    strength: row.strength,
    defense: row.defense,
    accuracy: row.accuracy,
    evasion: row.evasion,
  };
}

export async function equippedOf(db: Executor, characterId: string): Promise<EquippedItem[]> {
  const rows = await db
    .select()
    .from(itemInstances)
    .where(eq(itemInstances.characterId, characterId));
  return rows
    .filter((row) => row.equippedSlot)
    .map((row) => ({
      itemId: row.defId,
      slot: row.equippedSlot as EquippedItem['slot'],
      qualityBp: row.qualityBp,
      rarity: row.rarity as ItemRarity,
      enhancement: row.enhancement,
    }));
}

/** Kończy Przytułek i Sanatorium, gdy minął ich czas. */
export async function resolveStatus(
  db: Executor,
  character: CharacterRow,
  now: Date,
): Promise<ResourceValues> {
  const stats = await loadStats(db, character.id, true);
  const equipped = await equippedOf(db, character.id);
  const loadout = computeLoadout(equipped);
  const ctx = resourceContextFor(character.level, loadout);
  let resources = materializeAll(
    await loadResources(db, character.id, { forUpdate: true }),
    ctx,
    now,
  );
  if (stats.status !== 'ok' && stats.statusUntil && stats.statusUntil <= now) {
    if (stats.status === 'broken') {
      const max = resourceMax('sanity', ctx);
      resources = {
        ...resources,
        sanity: {
          value: Math.max(resources.sanity.value, applyBp(max, BREAKDOWN_EXIT_SANITY_BP)),
          updatedAt: now.getTime(),
        },
      };
    }
    if (stats.status === 'dead') {
      resources = {
        ...resources,
        life: { value: Math.max(resources.life.value, 1), updatedAt: now.getTime() },
      };
    }
    await db
      .update(characterStats)
      .set({ status: 'ok', statusUntil: null })
      .where(eq(characterStats.characterId, character.id));
    await saveResources(db, character.id, resources);
  }
  return resources;
}

export async function assertCanAct(
  db: Executor,
  character: CharacterRow,
  now: Date,
): Promise<void> {
  await resolveStatus(db, character, now);
  const stats = await loadStats(db, character.id);
  if (stats.status !== 'ok' && stats.statusUntil && stats.statusUntil > now) {
    throw new AppError(
      409,
      ERROR_CODES.incapacitated,
      stats.status === 'dead' ? 'Leżysz w Przytułku św. Agaty' : 'Jesteś w Sanatorium Blackwood',
    );
  }
}

/** Migawka szansy zlecenia — liczona raz, przy starcie. */
export async function missionSnapshot(
  db: Executor,
  character: CharacterRow,
  mission: MissionDef,
  requiredStat: number,
  mastery: number,
) {
  const stats = statBlock(await loadStats(db, character.id));
  const loadout = computeLoadout(await equippedOf(db, character.id));
  const effective = effectiveStatsCenti(stats, loadout);
  const stat: CombatStat = MISSION_KIND_STAT[mission.kind];
  const ctx = resourceContextFor(character.level, loadout);
  return {
    chanceBp: missionChanceBp(mastery, statUnits(effective[stat]), requiredStat),
    maxLife: resourceMax('life', ctx),
    classId: loadout.classId,
  };
}

/** Załamanie po Aurze Portalu: Sanatorium, bez rany ciała (GDD 4.3, 5.12.1). */
export async function enterSanatorium(
  db: Executor,
  character: CharacterRow,
  resources: ResourceValues,
  now: Date,
): Promise<ResourceValues> {
  const until = new Date(now.getTime() + breakdownDurationMs(character.level));
  await db
    .update(characterStats)
    .set({ status: 'broken', statusUntil: until })
    .where(eq(characterStats.characterId, character.id));
  const next = {
    ...resources,
    sanity: { value: 0, updatedAt: now.getTime() },
  };
  await saveResources(db, character.id, next);
  await maybeMindScar(db, character.id, `${character.id}:scar:${now.toISOString()}`);
  return next;
}

export async function enterHospital(
  db: Executor,
  character: CharacterRow,
  resources: ResourceValues,
  now: Date,
  dread: number,
): Promise<ResourceValues> {
  const until = new Date(now.getTime() + hospitalDurationMs(character.level, dread));
  await db
    .update(characterStats)
    .set({ status: 'dead', statusUntil: until })
    .where(eq(characterStats.characterId, character.id));
  const next = {
    ...resources,
    life: adjustResource('life', resources.life, now.getTime(), 1, 0),
  };
  next.life = { value: 0, updatedAt: now.getTime() };
  await saveResources(db, character.id, next);
  return next;
}

export type { ClassId };
