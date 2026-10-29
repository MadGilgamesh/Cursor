import {
  RESOURCE_KINDS,
  materializeResource,
  resourceMax,
  type ResourceContext,
  type ResourceKind,
  type Resources,
  type StoredResource,
} from '@game/shared';
import { eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import { resourceStates, type ResourceStateRow } from '../db/schema.js';

export type ResourceValues = Record<ResourceKind, StoredResource>;

/** Wiedza i Blizny obniżają maksimum Poczytalności (GDD 6.1, 6.2). */
export const resourceContext = (
  level: number,
  knowledge = 0,
  sanityPenalty = 0,
): ResourceContext => ({ level, knowledge, sanityPenalty });

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

/** Wylicza bieżące wartości z czasu serwera (bez zapisu). */
export function materializeAll(
  values: ResourceValues,
  ctx: ResourceContext,
  now: Date,
): ResourceValues {
  const at = now.getTime();
  return Object.fromEntries(
    RESOURCE_KINDS.map((kind) => [
      kind,
      materializeResource(kind, values[kind], at, resourceMax(kind, ctx)),
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
