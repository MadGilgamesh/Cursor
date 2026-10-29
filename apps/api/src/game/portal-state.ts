/**
 * Pęk Kluczy i wiersz postępu Portalu. Mutacje tylko wewnątrz transakcji,
 * z blokadą wiersza — tak samo jak zasoby.
 */
import {
  HUNT_SHARD_CHANCE_BP,
  KEY_RING_CAP,
  KEY_REGEN_INTERVAL_MS,
  STARTING_CANDLES,
  addKeyShards,
  addLootKeys,
  createRng,
  huntKeyShard,
  materializeKeyRing,
  missionKeyShards,
  type KeyRing,
} from '@game/shared';
import { eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import { portalStates, type PortalStateRow } from '../db/schema.js';

export async function insertPortalState(
  db: Executor,
  characterId: string,
  now: Date,
): Promise<void> {
  await db.insert(portalStates).values({
    characterId,
    regenUpdatedAt: now,
    candles: STARTING_CANDLES,
  });
}

export async function loadPortal(
  db: Executor,
  characterId: string,
  forUpdate = false,
): Promise<PortalStateRow> {
  const query = db
    .select()
    .from(portalStates)
    .where(eq(portalStates.characterId, characterId))
    .limit(1);
  const [row] = forUpdate ? await query.for('update') : await query;
  if (!row) throw new Error(`Postać ${characterId} nie ma stanu Portalu`);
  return row;
}

export function ringOf(row: PortalStateRow): KeyRing {
  return {
    regenKeys: row.regenKeys,
    regenUpdatedAt: row.regenUpdatedAt.getTime(),
    lootKeys: row.lootKeys,
    shards: row.shards,
  };
}

export function withRing(row: PortalStateRow, ring: KeyRing, now: Date): PortalStateRow {
  return {
    ...row,
    regenKeys: ring.regenKeys,
    regenUpdatedAt: new Date(ring.regenUpdatedAt),
    lootKeys: ring.lootKeys,
    shards: ring.shards,
    // Kotwica pełnego Pęku idzie do `now`, jak przy zasobach.
    ...(ring.regenKeys >= KEY_RING_CAP ? { regenUpdatedAt: now } : {}),
  };
}

function materialized(row: PortalStateRow, now: Date): PortalStateRow {
  return withRing(row, materializeKeyRing(ringOf(row), now.getTime()), now);
}

export async function grantKeyShards(
  db: Executor,
  characterId: string,
  shards: number,
  now: Date,
): Promise<PortalStateRow> {
  const row = materialized(await loadPortal(db, characterId, true), now);
  const ring = addKeyShards(ringOf(row), shards);
  const next = withRing(row, ring, now);
  await savePortal(db, next);
  return next;
}

export async function grantLootKeys(
  db: Executor,
  characterId: string,
  keys: number,
  now: Date,
): Promise<PortalStateRow> {
  const row = materialized(await loadPortal(db, characterId, true), now);
  const next = withRing(row, addLootKeys(ringOf(row), keys), now);
  await savePortal(db, next);
  return next;
}

export async function savePortal(db: Executor, row: PortalStateRow): Promise<void> {
  await db
    .update(portalStates)
    .set({
      regenKeys: row.regenKeys,
      regenUpdatedAt: row.regenUpdatedAt,
      lootKeys: row.lootKeys,
      shards: row.shards,
      meteorShards: row.meteorShards,
      engraverDay: row.engraverDay,
      engraverCount: row.engraverCount,
      clearedDomain: row.clearedDomain,
      clearedStage: row.clearedStage,
      clearedSubstage: row.clearedSubstage,
      materials: row.materials,
      sigilShards: row.sigilShards,
      sigils: row.sigils,
      wellFloor: row.wellFloor,
      wellGuardians: row.wellGuardians,
      whisperId: row.whisperId,
      whisperUntilFloor: row.whisperUntilFloor,
      candles: row.candles,
      seanceDry: row.seanceDry,
      beyondDry: row.beyondDry,
      ectoplasm: row.ectoplasm,
      echoes: row.echoes,
      activeEchoId: row.activeEchoId,
    })
    .where(eq(portalStates.characterId, row.characterId));
}

export function keyRegenFullAt(row: PortalStateRow, now: Date): string | null {
  const ring = materializeKeyRing(ringOf(row), now.getTime());
  if (ring.regenKeys >= KEY_RING_CAP) return null;
  const missing = KEY_RING_CAP - ring.regenKeys;
  return new Date(ring.regenUpdatedAt + missing * KEY_REGEN_INTERVAL_MS).toISOString();
}

export { materialized as materializePortal };

/** Zlecenie ≥ 1 h: 20% na Odłamek; 8 h: pewny Odłamek. Tylko przy sukcesie. */
export async function grantMissionShards(
  db: Executor,
  characterId: string,
  tierId: string,
  success: boolean,
  seed: string,
  now: Date,
): Promise<void> {
  const hit = createRng(`${seed}:shard`).rollBp(2_000);
  const shards = missionKeyShards(tierId, success, hit);
  if (shards > 0) await grantKeyShards(db, characterId, shards, now);
}

/** Nazwany z Kręgu V i wyżej: 10% na Odłamek. */
export async function grantHuntShard(
  db: Executor,
  characterId: string,
  circle: number,
  named: boolean,
  seed: string,
  now: Date,
): Promise<void> {
  const hit = createRng(`${seed}:shard`).rollBp(HUNT_SHARD_CHANCE_BP);
  if (huntKeyShard(circle, named, hit) === 1) await grantKeyShards(db, characterId, 1, now);
}
