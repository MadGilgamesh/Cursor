import postgres from 'postgres';

import { ensureDatabase, runGameMigrations } from '../../server/migrate.js';

const databaseUrl =
  process.env.PANEL_TEST_DATABASE_URL ?? 'postgres://game:game@localhost:5432/game_panel_test';

export default async function setup(): Promise<void> {
  await ensureDatabase(databaseUrl);
  await runGameMigrations(databaseUrl);
  const db = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await db`truncate table accounts, sessions, characters, resource_states, wallet_entries, timed_activities, idempotency_keys, audit_log, push_subscriptions cascade`;
  } finally {
    await db.end({ timeout: 5 });
  }
}
