import { hashPassword } from '../../server/password.js';
import { STAFF_COOKIE } from '../../server/session.js';
import {
  accounts,
  characters,
  resourceStates,
  sessions,
  staffAccounts,
  walletEntries,
  auditLog,
  accountBans,
} from '../../server/schema.js';
import { buildPanelApp } from '../../server/app.js';
import type { PanelConfig } from '../../server/config.js';
import { systemClock } from '../../server/clock.js';
import { createDatabase } from '../../server/db.js';
import { ensurePanelSchema } from '../../server/migrate.js';
import { bootstrapStaff, seedBaseline } from '../../server/prepare.js';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const databaseUrl =
  process.env.PANEL_TEST_DATABASE_URL ?? 'postgres://game:game@localhost:5432/game_panel_test';

const admin = {
  email: 'kustosz@sol.test',
  password: 'Latarnia-pamieci-1',
  role: 'administrator' as const,
};

function testConfig(): PanelConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    databaseUrl,
    cookieSecure: false,
    sessionTtlMs: 60 * 60 * 1000,
    authRateLimitMax: 1_000,
    bootstrap: admin,
  };
}

let app: FastifyInstance;
let db: ReturnType<typeof createDatabase>['db'];
let closeDb: () => Promise<void>;

async function reset(): Promise<void> {
  await db.execute(sql`
    truncate table
      content_actions,
      content_state,
      content_publications,
      announcements,
      staff_sessions,
      staff_accounts,
      account_bans,
      accounts
    cascade
  `);
  await seedBaseline(db);
  await bootstrapStaff(db, admin);
}

beforeAll(async () => {
  const database = createDatabase(databaseUrl);
  db = database.db;
  closeDb = database.close;
  await ensurePanelSchema(db);
  const built = await buildPanelApp({ config: testConfig(), db, clock: systemClock });
  app = built;
  await app.ready();
});

beforeEach(async () => {
  await reset();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

async function login(email: string, password: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/panel/login',
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies.find((item) => item.name === STAFF_COOKIE);
  if (!cookie) throw new Error('Brak ciasteczka personelu');
  return cookie.value;
}

function asStaff(token: string) {
  return { cookies: { [STAFF_COOKIE]: token } };
}

async function insertPlayer() {
  const now = new Date();
  const [account] = await db
    .insert(accounts)
    .values({ email: 'gracz@sol.test', passwordHash: await hashPassword('Haslo-gracza-1') })
    .returning();
  if (!account) throw new Error('Brak konta');
  const [character] = await db
    .insert(characters)
    .values({ accountId: account.id, name: 'Topielec', level: 3, experience: 10 })
    .returning();
  if (!character) throw new Error('Brak postaci');
  await db.insert(resourceStates).values({
    characterId: character.id,
    life: 90,
    lifeUpdatedAt: now,
    vigor: 40,
    vigorUpdatedAt: now,
    toil: 5,
    toilUpdatedAt: now,
    sanity: 80,
    sanityUpdatedAt: now,
  });
  await db.insert(sessions).values({
    accountId: account.id,
    tokenHash: 'sesja-testowa',
    expiresAt: new Date(now.getTime() + 86_400_000),
  });
  return { account, character };
}

describe('role Kancelarii', () => {
  it('nie wpuszcza gracza i rozdziela uprawnienia ról', async () => {
    await insertPlayer();
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/panel/login',
      payload: { email: 'gracz@sol.test', password: 'Haslo-gracza-1' },
    });
    expect(rejected.statusCode).toBe(401);

    await db.insert(staffAccounts).values({
      email: 'pisarz@sol.test',
      passwordHash: await hashPassword('Pisarz-tresci-1'),
      role: 'content_designer',
    });
    await db.insert(staffAccounts).values({
      email: 'straznik@sol.test',
      passwordHash: await hashPassword('Straznik-nocy-1'),
      role: 'moderator',
    });
    const designer = await login('pisarz@sol.test', 'Pisarz-tresci-1');
    const players = await app.inject({
      method: 'GET',
      url: '/api/panel/players',
      ...asStaff(designer),
    });
    expect(players.statusCode).toBe(403);
    const content = await app.inject({
      method: 'GET',
      url: '/api/panel/content',
      ...asStaff(designer),
    });
    expect(content.statusCode).toBe(200);

    const moderator = await login('straznik@sol.test', 'Straznik-nocy-1');
    const ledger = await app.inject({
      method: 'POST',
      url: '/api/panel/players/00000000-0000-7000-8000-000000000001/ledger',
      ...asStaff(moderator),
      headers: { 'idempotency-key': 'moderator-nie-moze' },
      payload: { currency: 'silver', delta: 1 },
    });
    expect(ledger.statusCode).toBe(403);
  });
});

describe('księga, audyt i blokada', () => {
  it('nadaje srebro tylko wpisem księgi i blokuje konto', async () => {
    const { account, character } = await insertPlayer();
    const token = await login(admin.email, admin.password);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/panel/players/${account.id}`,
      ...asStaff(token),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      character: { name: 'Topielec', level: 3 },
      wallet: [
        { currency: 'silver', balance: 0 },
        { currency: 'bank', balance: 0 },
      ],
    });

    const grant = await app.inject({
      method: 'POST',
      url: `/api/panel/players/${account.id}/ledger`,
      ...asStaff(token),
      headers: { 'idempotency-key': 'nadanie-srebra-1' },
      payload: { currency: 'silver', delta: 40 },
    });
    expect(grant.statusCode).toBe(200);
    expect(grant.json()).toMatchObject({ delta: 40, balanceAfter: 40, replayed: false });

    const replay = await app.inject({
      method: 'POST',
      url: `/api/panel/players/${account.id}/ledger`,
      ...asStaff(token),
      headers: { 'idempotency-key': 'nadanie-srebra-1' },
      payload: { currency: 'silver', delta: 40 },
    });
    expect(replay.json<{ balanceAfter: number; replayed: boolean; seq: number }>()).toMatchObject({
      balanceAfter: 40,
      replayed: true,
      seq: grant.json<{ seq: number }>().seq,
    });

    const tooMuch = await app.inject({
      method: 'POST',
      url: `/api/panel/players/${account.id}/ledger`,
      ...asStaff(token),
      headers: { 'idempotency-key': 'za-duzo-srebra' },
      payload: { currency: 'silver', delta: -100 },
    });
    expect(tooMuch.statusCode).toBe(409);

    const entries = await db
      .select()
      .from(walletEntries)
      .where(eq(walletEntries.characterId, character.id));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ delta: 40, balanceAfter: 40, reason: 'staff.grant' });
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'staff.grant'));
    expect(audits).toHaveLength(1);

    const ban = await app.inject({
      method: 'POST',
      url: `/api/panel/players/${account.id}/ban`,
      ...asStaff(token),
      payload: { reason: 'Szeptał do latarni' },
    });
    expect(ban.statusCode).toBe(204);
    const bans = await db.select().from(accountBans);
    expect(bans).toHaveLength(1);
    const openSessions = await db.select().from(sessions);
    expect(openSessions).toHaveLength(0);
  });
});

describe('publikacja treści', () => {
  it('zostawia wynik akcji na rewizji, na której wystartowała', async () => {
    const token = await login(admin.email, admin.password);
    const before = await app.inject({
      method: 'GET',
      url: '/api/panel/content',
      ...asStaff(token),
    });
    const mission = before
      .json<{
        draft: { collections: { missions: { id: string; successTexts: string[] }[] } };
      }>()
      .draft.collections.missions.find((item) => item.id === 'order.quay-patrol');
    if (!mission) throw new Error('Brak zlecenia w szkicu');
    const started = await app.inject({
      method: 'POST',
      url: '/api/panel/actions',
      ...asStaff(token),
      payload: { kind: 'mission', defId: 'order.quay-patrol' },
    });
    expect(started.statusCode).toBe(201);
    const first = started.json<{
      id: string;
      outcome: { summary: string };
      contentRevision: number;
    }>();
    expect(first.outcome.summary).toBe(mission.successTexts[0]);
    expect(first.contentRevision).toBe(1);

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/panel/content/records',
      ...asStaff(token),
      payload: {
        collection: 'missions',
        record: { ...mission, successTexts: ['Inny raport z nabrzeża.'] },
      },
    });
    expect(saved.statusCode).toBe(200);
    const published = await app.inject({
      method: 'POST',
      url: '/api/panel/content/publish',
      ...asStaff(token),
    });
    expect(published.json()).toMatchObject({ revision: 2 });

    const still = await app.inject({
      method: 'GET',
      url: `/api/panel/actions/${first.id}`,
      ...asStaff(token),
    });
    expect(still.json<{ outcome: { summary: string } }>().outcome.summary).toBe(
      mission.successTexts[0],
    );

    const second = await app.inject({
      method: 'POST',
      url: '/api/panel/actions',
      ...asStaff(token),
      payload: { kind: 'mission', defId: 'order.quay-patrol' },
    });
    const secondBody = second.json<{
      id: string;
      outcome: { summary: string };
      contentRevision: number;
    }>();
    expect(secondBody.outcome.summary).toBe('Inny raport z nabrzeża.');
    expect(secondBody.contentRevision).toBe(2);

    const rolled = await app.inject({
      method: 'POST',
      url: '/api/panel/content/rollback',
      ...asStaff(token),
      payload: { revision: 1 },
    });
    expect(rolled.json()).toMatchObject({ revision: 1 });
    const firstAfter = await app.inject({
      method: 'GET',
      url: `/api/panel/actions/${first.id}`,
      ...asStaff(token),
    });
    const secondAfter = await app.inject({
      method: 'GET',
      url: `/api/panel/actions/${secondBody.id}`,
      ...asStaff(token),
    });
    expect(firstAfter.json<{ outcome: { summary: string } }>().outcome.summary).toBe(
      mission.successTexts[0],
    );
    expect(secondAfter.json<{ outcome: { summary: string } }>().outcome.summary).toBe(
      'Inny raport z nabrzeża.',
    );

    const third = await app.inject({
      method: 'POST',
      url: '/api/panel/actions',
      ...asStaff(token),
      payload: { kind: 'mission', defId: 'order.quay-patrol' },
    });
    const thirdBody = third.json<{ contentRevision: number; outcome: { summary: string } }>();
    expect(thirdBody.contentRevision).toBe(1);
    expect(thirdBody.outcome.summary).toBe(mission.successTexts[0]);
  });
});

describe('ogłoszenia', () => {
  it('włącza i wyłącza ogłoszenie', async () => {
    const token = await login(admin.email, admin.password);
    const created = await app.inject({
      method: 'POST',
      url: '/api/panel/announcements',
      ...asStaff(token),
      payload: { title: 'Mgła nad kanałem', body: 'Nie schodźcie na molo.', enabled: false },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: string }>().id;
    const enabled = await app.inject({
      method: 'POST',
      url: `/api/panel/announcements/${id}/enabled`,
      ...asStaff(token),
      payload: { enabled: true },
    });
    expect(enabled.json()).toMatchObject({ enabled: true });
    const disabled = await app.inject({
      method: 'POST',
      url: `/api/panel/announcements/${id}/enabled`,
      ...asStaff(token),
      payload: { enabled: false },
    });
    expect(disabled.json()).toMatchObject({ enabled: false });
  });
});
