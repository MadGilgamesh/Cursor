import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
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

export type AccountRow = typeof accounts.$inferSelect;
export type CharacterRow = typeof characters.$inferSelect;
