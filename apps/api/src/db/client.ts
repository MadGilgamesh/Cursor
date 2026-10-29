import type { PgDatabase } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>['db'];

export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    // Nie zaśmiecamy logów komunikatami NOTICE (np. „relation already exists”).
    onnotice: () => undefined,
  });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}

/** Połączenie albo transakcja — funkcje domenowe działają na obu (transakcje zagnieżdżają się jako savepointy). */
export type Executor = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;
