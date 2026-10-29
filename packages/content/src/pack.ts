/**
 * Odczyt paczki: migracja addytywna do bieżącego formatu, potem walidacja Zod.
 * Pola, których schemat nie zna, znikają z wyniku i nie przerywają ładowania.
 */
import type { ZodType } from 'zod';

import {
  applyAdditiveMigrations,
  CURRENT_FORMAT,
  parseEnvelope,
  SCHEMA_MIGRATIONS,
  type AdditiveMigration,
} from './migrate.js';
import {
  collectionSchemas,
  COLLECTION_NAMES,
  formatIssues,
  type CollectionName,
  type ContentCollections,
  type GameEvent,
} from './schema.js';

export interface ContentPack {
  format: number;
  id: string;
  revision: number;
  label: string;
  collections: ContentCollections;
}

export interface LoadedPack extends ContentPack {
  /** Kolekcje dokładane rozszerzeniem schematu (test i przyszłe typy treści). */
  extras: Record<string, unknown[]>;
}

export interface SchemaExtension {
  toFormat: number;
  migrations: readonly AdditiveMigration[];
  collections: Readonly<Record<string, ZodType<unknown[]>>>;
}

function requireArray(collections: Record<string, unknown>, name: string): unknown {
  if (!(name in collections)) throw new Error(`Brak kolekcji „${name}”`);
  if (!Array.isArray(collections[name])) throw new Error(`Kolekcja „${name}” nie jest tablicą`);
  return collections[name];
}

function parseCollection<T>(name: string, value: unknown, schema: ZodType<T>): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`Kolekcja „${name}”: ${formatIssues(result.error)}`);
  return result.data;
}

function parseKnown(collections: Record<string, unknown>): ContentCollections {
  return {
    bestiary: parseCollection(
      'bestiary',
      requireArray(collections, 'bestiary'),
      collectionSchemas.bestiary,
    ),
    items: parseCollection('items', requireArray(collections, 'items'), collectionSchemas.items),
    missions: parseCollection(
      'missions',
      requireArray(collections, 'missions'),
      collectionSchemas.missions,
    ),
    locations: parseCollection(
      'locations',
      requireArray(collections, 'locations'),
      collectionSchemas.locations,
    ),
    texts: parseCollection('texts', requireArray(collections, 'texts'), collectionSchemas.texts),
    events: parseCollection(
      'events',
      requireArray(collections, 'events'),
      collectionSchemas.events,
    ),
  };
}

function assertUnique(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Zduplikowany identyfikator (${label}): ${id}`);
    seen.add(id);
  }
}

function assertEventReferences(collections: ContentCollections): void {
  const items = new Set(collections.items.map((item) => item.id));
  for (const event of collections.events) {
    const modifiers = new Set<string>();
    for (const modifier of event.modifiers) {
      if (modifiers.has(modifier.id)) {
        throw new Error(`Zduplikowany modyfikator ${modifier.id} w evencie ${event.id}`);
      }
      modifiers.add(modifier.id);
      if (modifier.operation === 'multiply' && modifier.value <= 0) {
        throw new Error(`Mnożnik ${modifier.id} w evencie ${event.id} musi być dodatni`);
      }
    }
    const checkRewards = (label: string, rewards: typeof event.rewards) => {
      for (const reward of rewards) {
        if (reward.kind === 'item' && !items.has(reward.itemId)) {
          throw new Error(`${label} nagradza nieznanym przedmiotem ${reward.itemId}`);
        }
      }
    };
    checkRewards(`Event ${event.id}`, event.rewards);
    const missions = new Set(event.missions.map((mission) => mission.id));
    const battles = new Set(event.battles.map((battle) => battle.id));
    const lore = new Set(event.lore.map((story) => story.id));
    const tasks = new Set(event.tasks.map((task) => task.id));
    assertUnique([...missions], `misja eventu ${event.id}`);
    assertUnique([...battles], `walka eventu ${event.id}`);
    assertUnique([...lore], `historia eventu ${event.id}`);
    assertUnique([...tasks], `zadanie eventu ${event.id}`);
    const shared = new Set<string>();
    for (const id of [...missions, ...battles, ...lore, ...tasks]) {
      if (shared.has(id)) throw new Error(`Powtórzony identyfikator w evencie ${event.id}: ${id}`);
      shared.add(id);
    }
    for (const mission of event.missions) checkRewards(`Misja ${mission.id}`, mission.rewards);
    for (const battle of event.battles) checkRewards(`Walka ${battle.id}`, battle.rewards);
    for (const task of event.tasks) {
      checkRewards(`Zadanie ${task.id}`, task.rewards);
      if (task.activity === 'eventMission' && (!task.subjectId || !missions.has(task.subjectId))) {
        throw new Error(`Zadanie ${task.id} wskazuje nieznaną misję eventu`);
      }
      if (task.activity === 'eventBattle' && (!task.subjectId || !battles.has(task.subjectId))) {
        throw new Error(`Zadanie ${task.id} wskazuje nieznaną walkę eventu`);
      }
      if (task.activity === 'eventLore' && (!task.subjectId || !lore.has(task.subjectId))) {
        throw new Error(`Zadanie ${task.id} wskazuje nieznaną historię eventu`);
      }
    }
  }
}

export function loadContentPack(input: unknown, extension?: SchemaExtension): LoadedPack {
  const envelope = parseEnvelope(input);
  const target = extension?.toFormat ?? CURRENT_FORMAT;
  const migrations = extension
    ? [...SCHEMA_MIGRATIONS, ...extension.migrations]
    : SCHEMA_MIGRATIONS;
  const migrated = applyAdditiveMigrations(envelope, migrations, target);
  const collections = parseKnown(migrated.collections);
  const extras: Record<string, unknown[]> = {};
  if (extension) {
    for (const [name, schema] of Object.entries(extension.collections)) {
      if (COLLECTION_NAMES.includes(name as CollectionName)) {
        throw new Error(`Rozszerzenie nie może nadpisać kolekcji „${name}”`);
      }
      const value = name in migrated.collections ? migrated.collections[name] : [];
      const parsed = schema.safeParse(value);
      if (!parsed.success) throw new Error(`Kolekcja „${name}”: ${formatIssues(parsed.error)}`);
      extras[name] = parsed.data;
    }
  }
  assertUnique(
    collections.bestiary.map((record) => record.id),
    'bestiariusz',
  );
  assertUnique(
    collections.items.map((record) => record.id),
    'przedmiot',
  );
  assertUnique(
    collections.missions.map((record) => record.id),
    'zlecenie',
  );
  assertUnique(
    collections.locations.map((record) => record.id),
    'lokacja',
  );
  assertUnique(
    collections.texts.map((record) => record.id),
    'tekst',
  );
  assertUnique(
    collections.events.map((record) => record.id),
    'event',
  );
  for (const records of Object.values(extras)) {
    const ids = records
      .map((record) =>
        record && typeof record === 'object' && 'id' in record ? String(record.id) : '',
      )
      .filter((id) => id.length > 0);
    assertUnique(ids, 'rozszerzenie');
  }
  assertEventReferences(collections);
  return {
    format: target,
    id: migrated.id,
    revision: migrated.revision,
    label: migrated.label,
    collections,
    extras,
  };
}

export function packDocument(pack: Pick<LoadedPack, keyof ContentPack>): ContentPack {
  return {
    format: pack.format,
    id: pack.id,
    revision: pack.revision,
    label: pack.label,
    collections: pack.collections,
  };
}

type RecordOf<C extends CollectionName> = ContentCollections[C][number];

export function upsertRecord<C extends CollectionName>(
  pack: ContentPack,
  collection: C,
  record: RecordOf<C>,
): ContentPack {
  const list = [...pack.collections[collection]] as RecordOf<C>[];
  const index = list.findIndex((item) => item.id === record.id);
  if (index === -1) list.push(record);
  else list[index] = record;
  return packDocument(
    loadContentPack({
      ...pack,
      collections: { ...pack.collections, [collection]: list },
    }),
  );
}

export function saveRecord(
  pack: ContentPack,
  collection: CollectionName,
  input: unknown,
): ContentPack {
  switch (collection) {
    case 'bestiary':
      return upsertRecord(pack, collection, collectionSchemas.bestiary.element.parse(input));
    case 'items':
      return upsertRecord(pack, collection, collectionSchemas.items.element.parse(input));
    case 'missions':
      return upsertRecord(pack, collection, collectionSchemas.missions.element.parse(input));
    case 'locations':
      return upsertRecord(pack, collection, collectionSchemas.locations.element.parse(input));
    case 'texts':
      return upsertRecord(pack, collection, collectionSchemas.texts.element.parse(input));
    case 'events':
      return upsertRecord(pack, collection, collectionSchemas.events.element.parse(input));
  }
}

export function removeRecord(
  pack: ContentPack,
  collection: CollectionName,
  id: string,
): ContentPack {
  const list = pack.collections[collection].filter((item) => item.id !== id);
  if (list.length === pack.collections[collection].length) {
    throw new Error(`Nie ma rekordu ${id} w kolekcji „${collection}”`);
  }
  return packDocument(
    loadContentPack({
      ...pack,
      collections: { ...pack.collections, [collection]: list },
    }),
  );
}

export function findEvent(pack: ContentPack, id: string): GameEvent | undefined {
  return pack.collections.events.find((event) => event.id === id);
}
