import type { MissionResult } from '@game/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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
    payload: jsonb('payload')
      .$type<{
        level: number;
        vigorCost: number;
        chanceBp: number;
        maxLife: number;
        loop: number;
        deepening?: number;
      }>()
      .notNull(),
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

/** Statystyki, Krąg i stany postaci (GDD 5.1, 4.3). Wartości statystyk w setnych punktu. */
export const characterStats = pgTable('character_stats', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  strength: integer('strength').notNull(),
  defense: integer('defense').notNull(),
  accuracy: integer('accuracy').notNull(),
  evasion: integer('evasion').notNull(),
  /** Najwyższa odblokowana sala Fechtowni (1 = Piwnica). */
  hall: integer('hall').notNull().default(1),
  /** Bieżący Krąg Łowów (9 = IX). */
  circle: integer('circle').notNull().default(9),
  namedWins: integer('named_wins').notNull().default(0),
  /** `ok` | `dead` (Przytułek) | `broken` (Sanatorium). */
  status: text('status').notNull().default('ok'),
  statusUntil: tstz('status_until'),
  addictionUntil: tstz('addiction_until'),
  tutorialDone: boolean('tutorial_done').notNull().default(false),
  lastSeenAt: tstz('last_seen_at'),
});

/** Postęp klas (GDD 5.5). Aktywna klasa wynika z założonego zestawu. */
export const classProgress = pgTable(
  'class_progress',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    classId: text('class_id').notNull(),
    level: integer('level').notNull().default(0),
    experience: integer('experience').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.classId] })],
);

/** Przedmioty postaci (GDD 8.2 `ItemInstance`). `equippedSlot` = założony. */
export const itemInstances = pgTable(
  'item_instances',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    defId: text('def_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    qualityBp: integer('quality_bp').notNull().default(10_000),
    rarity: text('rarity').notNull().default('common'),
    enhancement: integer('enhancement').notNull().default(0),
    equippedSlot: text('equipped_slot'),
    /** `auction` albo `trade`, gdy sztuka jest zablokowana. */
    hold: text('hold'),
    createdAt: createdAt(),
  },
  (t) => [
    index('item_instances_character_idx').on(t.characterId),
    uniqueIndex('item_instances_equipped_slot').on(t.characterId, t.equippedSlot),
    check('item_instances_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

/** Tablica Łowów — odświeżana co 30 min albo za Znój (GDD 5.3). */
export const huntBoards = pgTable('hunt_boards', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  circle: integer('circle').notNull(),
  generatedAt: tstz('generated_at').notNull(),
  targets: jsonb('targets').$type<HuntTargetStored[]>().notNull(),
});

export interface HuntTargetStored {
  enemyId: string;
  floor: number;
  named: boolean;
}

/** Biegłość i pętla zlecenia (GDD 5.9). */
export const missionProgress = pgTable(
  'mission_progress',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    missionId: text('mission_id').notNull(),
    successes: integer('successes').notNull().default(0),
    loops: integer('loops').notNull().default(0),
    /** Stopień Pogłębienia 0–5 (GDD 5.9). */
    deepening: integer('deepening').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.missionId] })],
);

/** Dzienne zadanie (6 wylosowanych pozycji) i Kalendarz Pamięci. */
export const dailyStates = pgTable(
  'daily_states',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    day: text('day').notNull(),
    tasks: jsonb('tasks').$type<{ kind: string; target: number }[]>().notNull(),
    progress: jsonb('progress').$type<Record<string, number>>().notNull(),
    claimed: boolean('claimed').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.day] })],
);

export const calendars = pgTable('calendars', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  streak: integer('streak').notNull().default(0),
  lastDay: text('last_day'),
  claimed: jsonb('claimed').$type<number[]>().notNull().default([]),
});

/** Dziennik walki do powtórki (GDD 8.2 `CombatLog`). */
export const combatLogs = pgTable(
  'combat_logs',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    seed: text('seed').notNull(),
    enemyId: text('enemy_id').notNull(),
    floor: integer('floor').notNull(),
    winner: text('winner').notNull(),
    log: jsonb('log').notNull(),
    engineVersion: integer('engine_version').notNull(),
    balanceVersion: integer('balance_version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('combat_logs_character_idx').on(t.characterId, t.createdAt)],
);

/** Pęk Kluczy, postęp Portalu, Studnia i Seanse (GDD 5.12, 5.10, 10.8). */
export const portalStates = pgTable('portal_states', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  regenKeys: integer('regen_keys').notNull().default(0),
  regenUpdatedAt: tstz('regen_updated_at').notNull(),
  lootKeys: integer('loot_keys').notNull().default(0),
  shards: integer('shards').notNull().default(0),
  meteorShards: integer('meteor_shards').notNull().default(0),
  engraverDay: text('engraver_day'),
  engraverCount: integer('engraver_count').notNull().default(0),
  clearedDomain: integer('cleared_domain').notNull().default(0),
  clearedStage: integer('cleared_stage').notNull().default(0),
  clearedSubstage: integer('cleared_substage').notNull().default(0),
  materials: jsonb('materials').$type<Record<string, number>>().notNull().default({}),
  sigilShards: integer('sigil_shards').notNull().default(0),
  /** Sigile bogów: klucz to numer Domeny. */
  sigils: jsonb('sigils').$type<Record<string, number>>().notNull().default({}),
  wellFloor: integer('well_floor').notNull().default(0),
  /** Piętra Strażników, których pierwsze zabicie już nagrodziło kluczami. */
  wellGuardians: jsonb('well_guardians').$type<number[]>().notNull().default([]),
  whisperId: text('whisper_id'),
  whisperUntilFloor: integer('whisper_until_floor').notNull().default(0),
  candles: integer('candles').notNull().default(3),
  seanceDry: integer('seance_dry').notNull().default(0),
  beyondDry: integer('beyond_dry').notNull().default(0),
  ectoplasm: integer('ectoplasm').notNull().default(0),
  /** Odłamki i poziom Ech. Poziom 0 = jeszcze nieaktywowane. */
  echoes: jsonb('echoes')
    .$type<Record<string, { shards: number; level: number }>>()
    .notNull()
    .default({}),
  activeEchoId: text('active_echo_id'),
  ichor: integer('ichor').notNull().default(0),
  reforgeDay: text('reforge_day'),
  reforgeCount: integer('reforge_count').notNull().default(0),
  /** Postęp ★: klucz to numer Domeny. */
  starTracks: jsonb('star_tracks')
    .$type<Record<string, { cleared: number; stage: number; substage: number }>>()
    .notNull()
    .default({}),
  /** Pęk Kluczy. *Klucznik* loży podnosi limit ponad 6. */
  keyCap: integer('key_cap').notNull().default(6),
});

export interface ResidentState {
  id: string;
  familiarity: number;
  gone: boolean;
}

/** Wiedza, Sprawy, frakcje, Kolegium i Bestiariusz (GDD 6, Etap 3). */
export const loreStates = pgTable('lore_states', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  knowledge: integer('knowledge').notNull().default(0),
  scars: jsonb('scars').$type<string[]>().notNull().default([]),
  madnessUi: boolean('madness_ui').notNull().default(true),
  composure: integer('composure').notNull().default(0),
  insight: integer('insight').notNull().default(0),
  stealth: integer('stealth').notNull().default(0),
  courseId: text('course_id'),
  courseEndsAt: tstz('course_ends_at'),
  coursesDone: jsonb('courses_done').$type<string[]>().notNull().default([]),
  constellation: jsonb('constellation').$type<string[]>().notNull().default([]),
  extinctOpen: boolean('extinct_open').notNull().default(false),
  reputation: jsonb('reputation').$type<Record<string, number>>().notNull().default({}),
  seals: jsonb('seals').$type<Record<string, number>>().notNull().default({}),
  residents: jsonb('residents').$type<ResidentState[]>().notNull().default([]),
  caseSeed: text('case_seed'),
  caseFound: jsonb('case_found').$type<string[]>().notNull().default([]),
  caseDeadline: tstz('case_deadline'),
  caseStatus: text('case_status').notNull().default('none'),
  documentClueId: text('document_clue_id'),
  documentEndsAt: tstz('document_ends_at'),
  readingId: text('reading_id'),
  readingEndsAt: tstz('reading_ends_at'),
  booksRead: jsonb('books_read').$type<string[]>().notNull().default([]),
  bestiary: jsonb('bestiary').$type<Record<string, number>>().notNull().default({}),
  bestiarySigils: jsonb('bestiary_sigils').$type<string[]>().notNull().default([]),
  unrestUntil: tstz('unrest_until'),
});

export interface PlotRow {
  cropId: string | null;
  plantedAt: number | null;
  wateredAt: number | null;
}

export interface FishCatch {
  species: string;
  weight: number;
  oddity: boolean;
  fishery: string;
  at: string;
}

export interface CityResidentRow {
  city: string;
  id: string;
  familiarity: number;
  gone: boolean;
}

/** Miasto, podróż, ogród i połów (GDD 5.16, 5.19, 5.20). */
export const worldStates = pgTable('world_states', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  city: text('city').notNull().default('salt'),
  travelTo: text('travel_to'),
  travelEndsAt: tstz('travel_ends_at'),
  travelAmbush: text('travel_ambush'),
  mountId: text('mount_id'),
  mountUntil: tstz('mount_until'),
  contamination: integer('contamination').notNull().default(0),
  /** Dziesiąte części Skażenia (Domeny 7+ i Przeklęte dokładają 0,1). */
  contaminationTenths: integer('contamination_tenths').notNull().default(0),
  sealDay: text('seal_day'),
  sealCount: integer('seal_count').notNull().default(0),
  sealedItems: jsonb('sealed_items').$type<string[]>().notNull().default([]),
  itemBrands: jsonb('item_brands').$type<Record<string, string>>().notNull().default({}),
  plots: jsonb('plots').$type<PlotRow[]>().notNull().default([]),
  seeds: jsonb('seeds').$type<Record<string, number>>().notNull().default({}),
  pantry: jsonb('pantry').$type<Record<string, number>>().notNull().default({}),
  castSeed: text('cast_seed'),
  castAt: tstz('cast_at'),
  hooks: integer('hooks').notNull().default(5),
  basket: jsonb('basket').$type<FishCatch[]>().notNull().default([]),
  journal: jsonb('journal').$type<FishCatch[]>().notNull().default([]),
  legends: jsonb('legends').$type<string[]>().notNull().default([]),
  residents: jsonb('residents').$type<CityResidentRow[]>().notNull().default([]),
  cityReputation: jsonb('city_reputation').$type<Record<string, number>>().notNull().default({}),
  clinicEndsAt: tstz('clinic_ends_at'),
  crate: jsonb('crate').$type<{ goodId: string; qty: number }[]>().notNull().default([]),
});

/** Towary giełdy trzymane poza ogrodem i koszem. */
export const marketStates = pgTable('market_states', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  goods: jsonb('goods').$type<Record<string, number>>().notNull().default({}),
});

/** Wiersz blokady księgi jednego towaru. */
export const marketBooks = pgTable('market_books', {
  goodId: text('good_id').primaryKey(),
});

export const marketOrders = pgTable(
  'market_orders',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    goodId: text('good_id').notNull(),
    side: text('side').notNull(),
    orderType: text('order_type').notNull(),
    price: integer('price'),
    quantity: integer('quantity').notNull(),
    remaining: integer('remaining').notNull(),
    escrowSilver: integer('escrow_silver').notNull().default(0),
    status: text('status').notNull().default('open'),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('market_orders_book_idx').on(t.goodId, t.status)],
);

export const marketFills = pgTable('market_fills', {
  id: id(),
  goodId: text('good_id').notNull(),
  buyOrderId: uuid('buy_order_id').notNull(),
  sellOrderId: uuid('sell_order_id').notNull(),
  buyerId: uuid('buyer_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  sellerId: uuid('seller_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  price: integer('price').notNull(),
  quantity: integer('quantity').notNull(),
  createdAt: createdAt(),
});

export const auctions = pgTable('auctions', {
  id: id(),
  sellerId: uuid('seller_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id')
    .notNull()
    .references(() => itemInstances.id, { onDelete: 'cascade' }),
  minBid: integer('min_bid').notNull(),
  buyNow: integer('buy_now'),
  currentBid: integer('current_bid').notNull().default(0),
  bidderId: uuid('bidder_id').references(() => characters.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('open'),
  createdAt: createdAt(),
});

export const directTrades = pgTable('direct_trades', {
  id: id(),
  makerId: uuid('maker_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  takerId: uuid('taker_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').references(() => itemInstances.id, { onDelete: 'set null' }),
  silver: integer('silver').notNull().default(0),
  status: text('status').notNull().default('open'),
  createdAt: createdAt(),
});

export const mails = pgTable('mails', {
  id: id(),
  fromId: uuid('from_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  toId: uuid('to_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  silver: integer('silver').notNull().default(0),
  goodId: text('good_id'),
  goodQty: integer('good_qty').notNull().default(0),
  claimed: boolean('claimed').notNull().default(false),
  createdAt: createdAt(),
});

export const workshopStates = pgTable('workshop_states', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  levels: jsonb('levels').$type<Record<string, number>>().notNull().default({}),
  jobs: jsonb('jobs')
    .$type<{ station: string; goodId: string; endsAt: string }[]>()
    .notNull()
    .default([]),
  candleAt: tstz('candle_at'),
});

export const chatMessages = pgTable('chat_messages', {
  id: id(),
  channel: text('channel').notNull(),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: createdAt(),
});

export const chatBlocks = pgTable(
  'chat_blocks',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.blockedId] })],
);

export const chatReports = pgTable(
  'chat_reports',
  {
    id: id(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('chat_reports_once').on(t.messageId, t.reporterId)],
);

export const lodges = pgTable(
  'lodges',
  {
    id: id(),
    name: text('name').notNull(),
    donationXp: integer('donation_xp').notNull().default(0),
    treasury: integer('treasury').notNull().default(0),
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    recruitment: boolean('recruitment').notNull().default(true),
    cutter: boolean('cutter').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('lodges_name_lower_unique').on(sql`lower(${t.name})`)],
);

export const lodgeMembers = pgTable(
  'lodge_members',
  {
    lodgeId: uuid('lodge_id')
      .notNull()
      .references(() => lodges.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    joinedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.lodgeId, t.characterId] }),
    uniqueIndex('lodge_members_character_unique').on(t.characterId),
  ],
);

export const lodgeSummons = pgTable(
  'lodge_summons',
  {
    id: id(),
    lodgeId: uuid('lodge_id')
      .notNull()
      .references(() => lodges.id, { onDelete: 'cascade' }),
    tier: integer('tier').notNull(),
    status: text('status').notNull().default('signing'),
    fightAt: tstz('fight_at').notNull(),
    replay: jsonb('replay').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('lodge_summons_lodge_idx').on(t.lodgeId, t.status)],
);

export const lodgeSignups = pgTable(
  'lodge_signups',
  {
    summonId: uuid('summon_id')
      .notNull()
      .references(() => lodgeSummons.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.summonId, t.characterId] })],
);

export const lodgeVoyages = pgTable('lodge_voyages', {
  id: id(),
  lodgeId: uuid('lodge_id')
    .notNull()
    .references(() => lodges.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('sailing'),
  endsAt: tstz('ends_at').notNull(),
  result: jsonb('result').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

export const voyageSignups = pgTable(
  'voyage_signups',
  {
    voyageId: uuid('voyage_id')
      .notNull()
      .references(() => lodgeVoyages.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.voyageId, t.characterId] })],
);

export const dreams = pgTable('dreams', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  startedAt: tstz('started_at').notNull(),
  resolvedAt: tstz('resolved_at'),
});

export const mentorships = pgTable('mentorships', {
  menteeId: uuid('mentee_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  mentorId: uuid('mentor_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
});

export const awakeningRuns = pgTable(
  'awakening_runs',
  {
    weekStart: text('week_start').notNull(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    lodgeId: uuid('lodge_id').references(() => lodges.id, { onDelete: 'set null' }),
    level: integer('level').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.weekStart, t.characterId] })],
);

export const awakeningPayouts = pgTable('awakening_payouts', {
  weekStart: text('week_start').primaryKey(),
  paidAt: tstz('paid_at').notNull(),
  ranks: jsonb('ranks').$type<Record<string, unknown>>().notNull().default({}),
});

export const awakeningReceipts = pgTable('awakening_receipts', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull().default(0),
});

/** Dom, Przysięga, kult, rytuał i półka tomów (GDD 5.4, 5.21, 6.4–6.6). */
export const hearthStates = pgTable('hearth_states', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  houseId: text('house_id'),
  buildEndsAt: tstz('build_ends_at'),
  paidThrough: text('paid_through'),
  arrears: boolean('arrears').notNull().default(false),
  rooms: jsonb('rooms').$type<Record<string, number>>().notNull().default({}),
  materials: jsonb('materials').$type<Record<string, number>>().notNull().default({}),
  candles: integer('candles').notNull().default(0),
  shelf: jsonb('shelf').$type<string[]>().notNull().default([]),
  sleeper: text('sleeper'),
  circle: integer('circle').notNull().default(0),
  pendingSleeper: text('pending_sleeper'),
  pendingFrom: tstz('pending_from'),
  wrathUntil: tstz('wrath_until'),
  cultSleeper: text('cult_sleeper'),
  cultOrders: integer('cult_orders').notNull().default(0),
  suspicion: integer('suspicion').notNull().default(0),
  unmaskedUntil: tstz('unmasked_until'),
  mutations: jsonb('mutations').$type<string[]>().notNull().default([]),
  mutationOffer: jsonb('mutation_offer').$type<string[] | null>(),
  chosenThresholds: jsonb('chosen_thresholds').$type<number[]>().notNull().default([]),
  wounds: jsonb('wounds').$type<{ id: string; until: string }[]>().notNull().default([]),
  ritualId: text('ritual_id'),
  ritualEndsAt: tstz('ritual_ends_at'),
  ritualSeed: text('ritual_seed'),
  hideout: boolean('hideout').notNull().default(false),
  hideoutLooted: boolean('hideout_looted').notNull().default(false),
  cursed: boolean('cursed').notNull().default(false),
  buffUntil: tstz('buff_until'),
  decayDay: text('decay_day'),
});

/** Wyprawa: lobby, bieg i rozliczenie (GDD 5.11). */
export const expeditions = pgTable('expeditions', {
  id: id(),
  leaderId: uuid('leader_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  defId: text('def_id').notNull(),
  status: text('status').notNull(),
  weekKey: text('week_key').notNull(),
  createdAt: createdAt(),
  startedAt: tstz('started_at'),
  endsAt: tstz('ends_at'),
  seed: text('seed'),
  pool: integer('pool'),
  sharedSanity: integer('shared_sanity'),
  missed: integer('missed'),
  betrayerId: uuid('betrayer_id'),
  log: jsonb('log').$type<string[]>().notNull().default([]),
});

export const expeditionMembers = pgTable(
  'expedition_members',
  {
    expeditionId: uuid('expedition_id')
      .notNull()
      .references(() => expeditions.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    assist: boolean('assist').notNull().default(false),
    ready: boolean('ready').notNull().default(false),
    classId: text('class_id'),
    sanity: integer('sanity'),
    maxSanity: integer('max_sanity'),
    level: integer('level'),
    share: integer('share'),
  },
  (t) => [primaryKey({ columns: [t.expeditionId, t.characterId] })],
);

export const expeditionEntries = pgTable(
  'expedition_entries',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    defId: text('def_id').notNull(),
    weekKey: text('week_key').notNull(),
    used: integer('used').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.defId, t.weekKey] })],
);

/** Eskorta w tym samym mieście (GDD 5.23). */
export const escorts = pgTable('escorts', {
  id: id(),
  protectorId: uuid('protector_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  wardId: uuid('ward_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  city: text('city').notNull(),
  status: text('status').notNull(),
  ambushTaken: boolean('ambush_taken').notNull().default(false),
  sanityCut: boolean('sanity_cut').notNull().default(false),
  createdAt: createdAt(),
});

export const friendships = pgTable(
  'friendships',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    friendId: uuid('friend_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.friendId] })],
);

export type LoreStateRow = typeof loreStates.$inferSelect;
export type HearthStateRow = typeof hearthStates.$inferSelect;
export type EscortRow = typeof escorts.$inferSelect;
export type ExpeditionRow = typeof expeditions.$inferSelect;
export type WorldStateRow = typeof worldStates.$inferSelect;

export type AccountRow = typeof accounts.$inferSelect;
export type PortalStateRow = typeof portalStates.$inferSelect;
export type CharacterRow = typeof characters.$inferSelect;
export type ResourceStateRow = typeof resourceStates.$inferSelect;
export type TimedActivityRow = typeof timedActivities.$inferSelect;
