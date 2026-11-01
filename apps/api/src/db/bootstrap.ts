import { fileURLToPath } from 'node:url';

import { runMigrations } from './migrate.js';
import { seedLocalAdminFromEnv } from './seed-local.js';

/** Migracje, a potem — gdy paczka podaje seed — jedno konto gracza. */
export async function bootstrapDatabase(databaseUrl: string): Promise<void> {
  await runMigrations(databaseUrl);
  await seedLocalAdminFromEnv(databaseUrl);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Brak zmiennej DATABASE_URL');
    process.exit(1);
  }
  await bootstrapDatabase(url);
  console.log('Migracje bazy danych zastosowane.');
}
