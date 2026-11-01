import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export type PanelDatabase = ReturnType<typeof createDatabase>['db'];

export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    onnotice: () => undefined,
    // Przygotowane zapytania postgres.js potrafią zawiesić drugie wywołanie tego samego selectu.
    prepare: false,
  });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}
