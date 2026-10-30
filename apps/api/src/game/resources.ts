import {
  RESOURCE_KINDS,
  materializeResource,
  resourceMax,
  roomRegenBp,
  type RegenPace,
  type ResourceContext,
  type ResourceKind,
  type Resources,
  type StoredResource,
} from '@game/shared';
import { eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import { hearthStates, resourceStates, type ResourceStateRow } from '../db/schema.js';

export type ResourceValues = Record<ResourceKind, StoredResource>;

/** Wiedza i Blizny obniżają maksimum Poczytalności (GDD 6.1, 6.2). */
export const resourceContext = (
  level: number,
  knowledge = 0,
  sanityPenalty = 0,
  patron = false,
): ResourceContext => ({ level, knowledge, sanityPenalty, patron });

function fromRow(row: ResourceStateRow): ResourceValues {
  return {
    life: { value: row.life, updatedAt: row.lifeUpdatedAt.getTime() },
    vigor: { value: row.vigor, updatedAt: row.vigorUpdatedAt.getTime() },
    toil: { value: row.toil, updatedAt: row.toilUpdatedAt.getTime() },
    sanity: { value: row.sanity, updatedAt: row.sanityUpdatedAt.getTime() },
  };
}

function toColumns(values: ResourceValues) {
  return {
    life: values.life.value,
    lifeUpdatedAt: new Date(values.life.updatedAt),
    vigor: values.vigor.value,
    vigorUpdatedAt: new Date(values.vigor.updatedAt),
    toil: values.toil.value,
    toilUpdatedAt: new Date(values.toil.updatedAt),
    sanity: values.sanity.value,
    sanityUpdatedAt: new Date(values.sanity.updatedAt),
  };
}

/** Pełne zasoby nowej postaci. */
export function initialResources(ctx: ResourceContext, now: Date): ResourceValues {
  const at = now.getTime();
  return Object.fromEntries(
    RESOURCE_KINDS.map((kind) => [kind, { value: resourceMax(kind, ctx), updatedAt: at }]),
  ) as ResourceValues;
}

/**
 * Premia Sypialni i Kaplicy Domowej. Ten sam wynik co pole `vigorBonusBp` /
 * `sanityBonusBp` na progu: dom stoi, a zaległość gasi pokoje.
 */
export async function houseRegenBp(
  db: Pick<Executor, 'select'>,
  characterId: string,
  now: Date,
): Promise<{ vigorRegenBp: number; sanityRegenBp: number }> {
  const [row] = await db
    .select({
      houseId: hearthStates.houseId,
      buildEndsAt: hearthStates.buildEndsAt,
      arrears: hearthStates.arrears,
      rooms: hearthStates.rooms,
    })
    .from(hearthStates)
    .where(eq(hearthStates.characterId, characterId))
    .limit(1);
  const built = Boolean(row?.houseId) && (!row?.buildEndsAt || row.buildEndsAt <= now);
  return roomRegenBp(row?.rooms ?? {}, row?.arrears ?? false, built);
}

/** Wylicza bieżące wartości z czasu serwera (bez zapisu). Tempo pokoi bierze z progu. */
export async function materializeAll(
  db: Pick<Executor, 'select'>,
  characterId: string,
  values: ResourceValues,
  ctx: ResourceContext,
  now: Date,
): Promise<ResourceValues> {
  const house = await houseRegenBp(db, characterId, now);
  const pace: RegenPace = {
    patron: ctx.patron === true,
    vigorRegenBp: house.vigorRegenBp,
    sanityRegenBp: house.sanityRegenBp,
  };
  const at = now.getTime();
  return Object.fromEntries(
    RESOURCE_KINDS.map((kind) => [
      kind,
      materializeResource(kind, values[kind], at, resourceMax(kind, ctx), pace),
    ]),
  ) as ResourceValues;
}

export function toResourcesDto(values: ResourceValues, ctx: ResourceContext): Resources {
  return Object.fromEntries(
    RESOURCE_KINDS.map((kind) => [
      kind,
      {
        value: values[kind].value,
        max: resourceMax(kind, ctx),
        updatedAt: new Date(values[kind].updatedAt).toISOString(),
      },
    ]),
  ) as Resources;
}

export async function insertResources(
  db: Pick<Executor, 'insert'>,
  characterId: string,
  values: ResourceValues,
): Promise<void> {
  await db.insert(resourceStates).values({ characterId, ...toColumns(values) });
}

/** Odczyt zasobów; `forUpdate` blokuje wiersz do końca transakcji. */
export async function loadResources(
  db: Pick<Executor, 'select'>,
  characterId: string,
  { forUpdate = false } = {},
): Promise<ResourceValues> {
  const query = db
    .select()
    .from(resourceStates)
    .where(eq(resourceStates.characterId, characterId))
    .limit(1);
  const [row] = forUpdate ? await query.for('update') : await query;
  if (!row) throw new Error(`Postać ${characterId} nie ma stanu zasobów`);
  return fromRow(row);
}

export async function saveResources(
  db: Pick<Executor, 'update'>,
  characterId: string,
  values: ResourceValues,
): Promise<void> {
  await db
    .update(resourceStates)
    .set(toColumns(values))
    .where(eq(resourceStates.characterId, characterId));
}
