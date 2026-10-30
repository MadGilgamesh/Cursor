import { Redis } from 'ioredis';
import postgres from 'postgres';

import { runMigrations } from '../../src/db/migrate.js';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './env.js';

/** Tworzy bazę testową (jeśli trzeba), stosuje migracje i czyści dane z poprzednich przebiegów. */
export default async function setup(): Promise<void> {
  const target = new URL(TEST_DATABASE_URL);
  const databaseName = target.pathname.slice(1);
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => undefined });
  try {
    const existing = await admin`select 1 from pg_database where datname = ${databaseName}`;
    if (existing.length === 0) await admin.unsafe(`create database "${databaseName}"`);
  } finally {
    await admin.end();
  }

  await runMigrations(TEST_DATABASE_URL);

  const db = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => undefined });
  try {
    await db`truncate table accounts, sessions, characters, resource_states, wallet_entries, timed_activities, idempotency_keys, audit_log, push_subscriptions, awakening_payouts, lodges, acts, lantern_states, abyss_payouts cascade`;
  } finally {
    await db.end();
  }

  const redis = new Redis(TEST_REDIS_URL);
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}
