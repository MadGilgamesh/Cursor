import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { panelSchemaStatements } from '@game/content';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type { PanelDatabase } from './db.js';

/** Katalog migracji gry. Inna głębokość przy `tsx` (server/) i przy `node dist/server`. */
export function gameMigrationsFolder(): string {
  const candidates = [
    new URL('../../api/drizzle', import.meta.url),
    new URL('../../../api/drizzle', import.meta.url),
    // Obraz Dockera trzyma migracje gry obok aplikacji, nie w monorepo.
    new URL('../../drizzle', import.meta.url),
  ];
  for (const url of candidates) {
    const path = fileURLToPath(url);
    if (existsSync(path)) return path;
  }
  throw new Error('Nie znaleziono katalogu migracji gry');
}

export async function ensureDatabase(databaseUrl: string): Promise<void> {
  const target = new URL(databaseUrl);
  const databaseName = target.pathname.slice(1);
  if (!/^[a-z0-9_]+$/i.test(databaseName)) {
    throw new Error(`Niedozwolona nazwa bazy: ${databaseName}`);
  }
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => undefined });
  try {
    const existing = await admin`select 1 from pg_database where datname = ${databaseName}`;
    if (existing.length === 0) await admin.unsafe(`create database "${databaseName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

export async function runGameMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(client), { migrationsFolder: gameMigrationsFolder() });
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function ensurePanelSchema(db: PanelDatabase): Promise<void> {
  for (const statement of panelSchemaStatements()) {
    await db.execute(sql.raw(statement));
  }
}
