import type { MissionResult } from '@game/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// uuidv7() (PostgreSQL 18+) daje identyfikatory uporządkowane w czasie — lepsze dla indeksów niż v4.
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Konto (GDD 8.2 `Account`). E-mail przechowujemy znormalizowany (małe litery). */
export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: createdAt(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('accounts_email_unique').on(t.email)],
);

/** Sesje logowania. W bazie trzymamy wyłącznie skrót SHA-256 tokenu, nigdy sam token. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_unique').on(t.tokenHash),
    index('sessions_account_id_idx').on(t.accountId),
  ],
);

/**
 * Postać (GDD 8.2 `Character`) — SZKIELET. Jedna na konto. Zasoby (`ResourceState`),
 * statystyki, stan i miasto dojdą w kolejnych etapach. Poziom i XP zmienia wyłącznie serwer.
 */
export const characters = pgTable(
  'characters',
  {
    id: id(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    level: integer('level').notNull().default(1),
    experience: bigint('experience', { mode: 'number' }).notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('characters_account_id_unique').on(t.accountId),
    uniqueIndex('characters_name_lower_unique').on(sql`lower(${t.name})`),
    check('characters_level_range', sql`${t.level} between 1 and 80`),
    check('characters_experience_non_negative', sql`${t.experience} >= 0`),
  ],
);

const tstz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Zasoby postaci (GDD 8.2 `ResourceState`) z leniwą regeneracją: wartość zapisana
 * w chwili `*_updated_at`; bieżącą liczy `materializeResource` z czasu serwera.
 */
export const resourceStates = pgTable(
  'resource_states',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    life: integer('life').notNull(),
    lifeUpdatedAt: tstz('life_updated_at').notNull(),
    vigor: integer('vigor').notNull(),
    vigorUpdatedAt: tstz('vigor_updated_at').notNull(),
    toil: integer('toil').notNull(),
    toilUpdatedAt: tstz('toil_updated_at').notNull(),
    sanity: integer('sanity').notNull(),
    sanityUpdatedAt: tstz('sanity_updated_at').notNull(),
  },
  (t) => [
    check(
      'resource_states_non_negative',
      sql`${t.life} >= 0 and ${t.vigor} >= 0 and ${t.toil} >= 0 and ${t.sanity} >= 0`,
    ),
  ],
);

/**
 * Księga walut (GDD 8.2 `WalletEntry`). Saldo zmienia się wyłącznie przez nowy wpis;
 * `seq` porządkuje wpisy postaci, a `balance_after` ostatniego wpisu to saldo.
 */
export const walletEntries = pgTable(
  'wallet_entries',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull(),
    delta: bigint('delta', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    refId: text('ref_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('wallet_entries_idempotency_unique').on(t.characterId, t.idempotencyKey),
    index('wallet_entries_balance_idx').on(t.characterId, t.currency, t.seq),
    check('wallet_entries_delta_non_zero', sql`${t.delta} <> 0`),
    check('wallet_entries_balance_non_negative', sql`${t.balanceAfter} >= 0`),
  ],
);

/**
 * Jeden model dla wszystkich timerów (GDD 8.2 `TimedActivity`). Wynik zależy od
 * ziarna zapisanego przy starcie; `result` powstaje przy rozstrzygnięciu.
 */
export const timedActivities = pgTable(
  'timed_activities',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    defId: text('def_id').notNull(),
    payload: jsonb('payload').$type<{ level: number; vigorCost: number }>().notNull(),
    status: text('status').$type<'active' | 'completed' | 'claimed'>().notNull(),
    startAt: tstz('start_at').notNull(),
    endAt: tstz('end_at').notNull(),
    resultSeed: text('result_seed').notNull(),
    result: jsonb('result').$type<MissionResult>(),
    balanceVersion: integer('balance_version').notNull(),
    loopCount: integer('loop_count').notNull().default(0),
    createdAt: createdAt(),
    resolvedAt: tstz('resolved_at'),
    claimedAt: tstz('claimed_at'),
  },
  (t) => [
    // Jedno nieodebrane zlecenie naraz (GDD 5.9) — także przy wyścigu równoległych żądań.
    uniqueIndex('timed_activities_one_open_per_type')
      .on(t.characterId, t.type)
      .where(sql`${t.status} in ('active', 'completed')`),
    index('timed_activities_due_idx').on(t.status, t.endAt),
    index('timed_activities_character_idx').on(t.characterId, t.status),
    check('timed_activities_status', sql`${t.status} in ('active', 'completed', 'claimed')`),
  ],
);

/** Klucze idempotencji żądań mutujących (GDD 9.2) z zapisaną odpowiedzią do powtórek. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code'),
    responseBody: jsonb('response_body'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.key] }),
    index('idempotency_keys_created_idx').on(t.createdAt),
  ],
);

/** Dziennik audytu (GDD 8.2 `AuditLog`): zmiany walut, zasobów, aktywności i logowania. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    actor: text('actor').$type<'player' | 'system'>().notNull(),
    action: text('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_account_idx').on(t.accountId, t.createdAt),
    index('audit_log_action_idx').on(t.action, t.createdAt),
  ],
);

/** Subskrypcje Web Push urządzeń gracza (GDD 3.3). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
    lastSuccessAt: tstz('last_success_at'),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_unique').on(t.endpoint),
    index('push_subscriptions_account_idx').on(t.accountId),
  ],
);

export type AccountRow = typeof accounts.$inferSelect;
export type CharacterRow = typeof characters.$inferSelect;
export type ResourceStateRow = typeof resourceStates.$inferSelect;
export type TimedActivityRow = typeof timedActivities.$inferSelect;
