import type { ContentPack } from '@game/content';
import type { StaffRole } from './permissions.js';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Fragment konta gracza — tylko kolumny, których Kancelaria potrzebuje. */
export const accounts = pgTable('accounts', {
  id: id(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const sessions = pgTable('sessions', {
  id: id(),
  accountId: uuid('account_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const characters = pgTable('characters', {
  id: id(),
  accountId: uuid('account_id').notNull(),
  name: text('name').notNull(),
  level: integer('level').notNull(),
  experience: bigint('experience', { mode: 'number' }).notNull(),
  createdAt: createdAt(),
});

export const resourceStates = pgTable('resource_states', {
  characterId: uuid('character_id').primaryKey(),
  life: integer('life').notNull(),
  lifeUpdatedAt: timestamp('life_updated_at', { withTimezone: true }).notNull(),
  vigor: integer('vigor').notNull(),
  vigorUpdatedAt: timestamp('vigor_updated_at', { withTimezone: true }).notNull(),
  toil: integer('toil').notNull(),
  toilUpdatedAt: timestamp('toil_updated_at', { withTimezone: true }).notNull(),
  sanity: integer('sanity').notNull(),
  sanityUpdatedAt: timestamp('sanity_updated_at', { withTimezone: true }).notNull(),
});

export const characterStats = pgTable('character_stats', {
  characterId: uuid('character_id').primaryKey(),
  hall: integer('hall').notNull(),
  circle: integer('circle').notNull(),
  status: text('status').notNull(),
});

/** Księga walut gry. Saldo zmienia wyłącznie nowy wpis — Kancelaria nie nadpisuje kolumny. */
export const walletEntries = pgTable('wallet_entries', {
  seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  characterId: uuid('character_id').notNull(),
  currency: text('currency').notNull(),
  delta: bigint('delta', { mode: 'number' }).notNull(),
  balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
  reason: text('reason').notNull(),
  refId: text('ref_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: createdAt(),
});

export const auditLog = pgTable('audit_log', {
  id: id(),
  accountId: uuid('account_id'),
  characterId: uuid('character_id'),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
});

export const staffAccounts = pgTable('staff_accounts', {
  id: id(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<StaffRole>().notNull(),
  createdAt: createdAt(),
});

export const staffSessions = pgTable('staff_sessions', {
  id: id(),
  staffId: uuid('staff_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const accountBans = pgTable('account_bans', {
  accountId: uuid('account_id').primaryKey(),
  reason: text('reason').notNull(),
  staffId: uuid('staff_id'),
  createdAt: createdAt(),
});

export const announcements = pgTable('announcements', {
  id: id(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  enabled: boolean('enabled').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contentPublications = pgTable('content_publications', {
  revision: integer('revision').primaryKey(),
  document: jsonb('document').$type<ContentPack>().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  staffId: uuid('staff_id'),
});

export const contentState = pgTable('content_state', {
  singleton: boolean('singleton').primaryKey().default(true),
  currentRevision: integer('current_revision'),
  draft: jsonb('draft').$type<ContentPack>(),
});

export const contentActions = pgTable('content_actions', {
  id: id(),
  kind: text('kind').notNull(),
  defId: text('def_id').notNull(),
  contentRevision: integer('content_revision').notNull(),
  characterId: uuid('character_id'),
  createdAt: createdAt(),
});
