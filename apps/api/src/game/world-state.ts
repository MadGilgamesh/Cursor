/**
 * Wiersz miasta, ogrodu i połowu. Mutacje w transakcji, z blokadą wiersza.
 */
import { CITY_RESIDENTS, GARDEN_PLOTS, HOOKS_START, emptyPlot } from '@game/shared';
import { eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import { worldStates, type WorldStateRow } from '../db/schema.js';

export function startingResidents(): WorldStateRow['residents'] {
  return Object.entries(CITY_RESIDENTS).flatMap(([city, people]) =>
    people.map((person) => ({ city, id: person.id, familiarity: 0, gone: false })),
  );
}

export async function insertWorldState(db: Executor, characterId: string): Promise<void> {
  await db.insert(worldStates).values({
    characterId,
    plots: Array.from({ length: GARDEN_PLOTS }, () => emptyPlot()),
    seeds: { wormwood: 2 },
    hooks: HOOKS_START,
    residents: startingResidents(),
  });
}

export async function loadWorld(
  db: Executor,
  characterId: string,
  forUpdate = false,
): Promise<WorldStateRow> {
  const query = db
    .select()
    .from(worldStates)
    .where(eq(worldStates.characterId, characterId))
    .limit(1);
  const [row] = forUpdate ? await query.for('update') : await query;
  if (!row) throw new Error(`Postać ${characterId} nie ma stanu świata`);
  return row;
}

export async function saveWorld(db: Executor, row: WorldStateRow): Promise<void> {
  await db
    .update(worldStates)
    .set({
      city: row.city,
      travelTo: row.travelTo,
      travelEndsAt: row.travelEndsAt,
      travelAmbush: row.travelAmbush,
      mountId: row.mountId,
      mountUntil: row.mountUntil,
      contamination: row.contamination,
      sealDay: row.sealDay,
      sealCount: row.sealCount,
      sealedItems: row.sealedItems,
      itemBrands: row.itemBrands,
      plots: row.plots,
      seeds: row.seeds,
      pantry: row.pantry,
      castSeed: row.castSeed,
      castAt: row.castAt,
      hooks: row.hooks,
      basket: row.basket,
      journal: row.journal,
      legends: row.legends,
      residents: row.residents,
      cityReputation: row.cityReputation,
      clinicEndsAt: row.clinicEndsAt,
      crate: row.crate,
    })
    .where(eq(worldStates.characterId, row.characterId));
}
