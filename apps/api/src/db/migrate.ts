import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDatabase } from './client.js';

/** Katalog migracji wygenerowanych przez drizzle-kit (działa zarówno z `src/`, jak i `dist/`). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(databaseUrl: string): Promise<void> {
  const { db, close } = createDatabase(databaseUrl, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Brak zmiennej DATABASE_URL');
    process.exit(1);
  }
  await runMigrations(url);
  console.log('Migracje bazy danych zastosowane.');
}
