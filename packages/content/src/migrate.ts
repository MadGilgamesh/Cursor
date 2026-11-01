/**
 * Migracje schematu paczki są wyłącznie addytywne: dokładają kolekcję,
 * nigdy nie usuwają ani nie przepisują istniejących rekordów.
 * Dzięki temu stara paczka zostaje poprawna po rozszerzeniu schematu.
 */
import { z } from 'zod';

import { formatIssues } from './schema.js';

/** Bieżący format. Rośnie tylko wtedy, gdy dochodzi nowy typ treści. */
export const CURRENT_FORMAT = 3;

export const PACK_ID = 'zapomniany-brzeg';

/**
 * Format 1: bestiariusz, przedmioty, zlecenia, teksty (rdzeń danych statycznych).
 * Format 2: dokładane lokacje.
 * Format 3: dokładane eventy.
 */
export interface AdditiveMigration {
  from: number;
  to: number;
  /** Nowe kolekcje. Gdy ich nie ma w starej paczce, dostają pustą tablicę. */
  addCollections: readonly string[];
}

export const SCHEMA_MIGRATIONS: readonly AdditiveMigration[] = [
  { from: 1, to: 2, addCollections: ['locations'] },
  { from: 2, to: 3, addCollections: ['events'] },
];

export interface PackEnvelope {
  format: number;
  id: string;
  revision: number;
  label: string;
  collections: Record<string, unknown>;
}

const envelopeSchema = z.object({
  format: z.int().positive(),
  id: z.string().min(1),
  revision: z.int().nonnegative(),
  label: z.string().min(1),
  collections: z.record(z.string(), z.unknown()),
});

export function parseEnvelope(input: unknown): PackEnvelope {
  const parsed = envelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Niepoprawna paczka treści: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

/**
 * Sprawdza, że migracja niczego nie zabrała. Wołana po każdym kroku;
 * test potrafi nią odrzucić migrację, która skraca kolekcję.
 */
export function assertCollectionsPreserved(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  for (const [name, value] of Object.entries(before)) {
    if (!Array.isArray(value)) continue;
    const next = after[name];
    if (!Array.isArray(next)) {
      throw new Error(`Migracja usunęła kolekcję „${name}”`);
    }
    if (next.length < value.length) {
      throw new Error(`Migracja skróciła kolekcję „${name}”`);
    }
    for (let index = 0; index < value.length; index += 1) {
      if (JSON.stringify(value[index]) !== JSON.stringify(next[index])) {
        throw new Error(`Migracja zmieniła rekord ${index} w kolekcji „${name}”`);
      }
    }
  }
}

export function applyAdditiveMigrations(
  envelope: PackEnvelope,
  migrations: readonly AdditiveMigration[],
  targetFormat: number,
): PackEnvelope {
  if (envelope.format > targetFormat) {
    throw new Error(
      `Paczka ma format ${envelope.format}, a ten czytnik zna najwyżej ${targetFormat}`,
    );
  }
  let current: PackEnvelope = {
    format: envelope.format,
    id: envelope.id,
    revision: envelope.revision,
    label: envelope.label,
    collections: { ...envelope.collections },
  };
  const steps = migrations
    .filter((step) => step.from >= envelope.format && step.to <= targetFormat)
    .slice()
    .sort((left, right) => left.from - right.from);

  for (const step of steps) {
    if (step.to !== step.from + 1) {
      throw new Error(`Migracja ${step.from} → ${step.to} musi iść o jeden format`);
    }
    if (step.from !== current.format) {
      throw new Error(`Migracja pomija format ${current.format}`);
    }
    const collections = { ...current.collections };
    for (const name of step.addCollections) {
      if (!(name in collections)) collections[name] = [];
    }
    const next: PackEnvelope = { ...current, format: step.to, collections };
    assertCollectionsPreserved(current.collections, next.collections);
    current = next;
  }
  if (current.format !== targetFormat) {
    throw new Error(`Paczka w formacie ${envelope.format} nie dochodzi do formatu ${targetFormat}`);
  }
  return current;
}
