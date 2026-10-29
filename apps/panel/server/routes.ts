import { COLLECTION_NAMES } from '@game/content';
import { CURRENCIES } from '@game/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Clock } from './clock.js';
import type { PanelConfig } from './config.js';
import {
  contentOverview,
  deleteRecord,
  publishContent,
  readAction,
  rollbackContent,
  startAction,
  writeRecord,
} from './content-store.js';
import type { PanelDatabase } from './db.js';
import { PanelError } from './errors.js';
import { burnPasswordCheck, verifyPassword } from './password.js';
import { can, type Permission } from './permissions.js';
import {
  banAccount,
  listAudit,
  listPlayers,
  playerDetail,
  postStaffLedger,
  unbanAccount,
} from './players.js';
import { announcements, staffAccounts } from './schema.js';
import {
  createStaffSession,
  deleteStaffSession,
  findStaffByToken,
  STAFF_COOKIE,
  type StaffPrincipal,
} from './session.js';

export interface RouteDeps {
  config: PanelConfig;
  db: PanelDatabase;
  clock: Clock;
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Podaj poprawny adres e-mail')),
  password: z.string().min(1, 'Podaj hasło').max(128),
});

const banSchema = z.object({
  reason: z.string().trim().min(3, 'Podaj powód blokady').max(280),
});

const ledgerSchema = z.object({
  currency: z.enum(CURRENCIES),
  delta: z.int().refine((value) => value !== 0, 'Zmiana salda nie może być zerem'),
});

const announcementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2_000),
  enabled: z.boolean().default(false),
});

const enabledSchema = z.object({ enabled: z.boolean() });

const recordSchema = z.object({
  collection: z.enum(COLLECTION_NAMES),
  record: z.unknown(),
});

const deleteSchema = z.object({
  collection: z.enum(COLLECTION_NAMES),
  id: z.string().min(1),
});

const rollbackSchema = z.object({
  revision: z.int().positive(),
});

const actionSchema = z.object({
  kind: z.enum(['mission', 'event']),
  defId: z.string().min(1),
  characterId: z.uuid().optional(),
});

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { config, db, clock } = deps;
  const attempts = new Map<string, { count: number; resetAt: number }>();

  // Musi zwrócić obietnicę: synchroniczny hook bez `next()` Fastify zostawia w zawieszeniu.
  const requirePermission = (permission: Permission) => (request: FastifyRequest) => {
    if (!request.staff) {
      throw new PanelError(401, 'UNAUTHORIZED', 'Zaloguj się do Kancelarii');
    }
    if (!can(request.staff.role, permission)) {
      throw new PanelError(403, 'FORBIDDEN', 'Ta rola nie ma tu wstępu');
    }
    return Promise.resolve();
  };

  const staffOf = (request: FastifyRequest): StaffPrincipal => {
    if (!request.staff) throw new PanelError(401, 'UNAUTHORIZED', 'Zaloguj się do Kancelarii');
    return request.staff;
  };

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[STAFF_COOKIE];
    request.staff = token ? ((await findStaffByToken(db, clock, token)) ?? null) : null;
  });

  app.get('/health', () => ({ status: 'ok' as const }));

  app.post('/login', async (request, reply) => {
    const now = clock.now().getTime();
    const slot = attempts.get(request.ip);
    if (!slot || slot.resetAt < now) attempts.set(request.ip, { count: 1, resetAt: now + 60_000 });
    else {
      slot.count += 1;
      if (slot.count > config.authRateLimitMax) {
        throw new PanelError(429, 'RATE_LIMITED', 'Zbyt wiele prób. Odczekaj chwilę.');
      }
    }
    const input = loginSchema.parse(request.body);
    const [staff] = await db
      .select()
      .from(staffAccounts)
      .where(eq(staffAccounts.email, input.email))
      .limit(1);
    if (!staff) await burnPasswordCheck(input.password);
    if (!staff || !(await verifyPassword(staff.passwordHash, input.password))) {
      throw new PanelError(401, 'UNAUTHORIZED', 'Nieprawidłowy e-mail lub hasło personelu');
    }
    const session = await createStaffSession(db, clock, staff.id, config.sessionTtlMs);
    setCookie(reply, config, session.token, session.expiresAt);
    return { id: staff.id, email: staff.email, role: staff.role };
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[STAFF_COOKIE];
    if (token) await deleteStaffSession(db, token);
    void reply.clearCookie(STAFF_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/me', (request) => staffOf(request));

  app.get('/players', { preHandler: requirePermission('playersRead') }, async (request) => {
    const query = z.object({ q: z.string().optional() }).parse(request.query);
    const players = await listPlayers(db, query.q ?? '');
    return {
      players: players.map((player) => ({
        ...player,
        createdAt: player.createdAt.toISOString(),
        lastLoginAt: player.lastLoginAt?.toISOString() ?? null,
      })),
    };
  });

  app.get(
    '/players/:accountId',
    { preHandler: requirePermission('playersRead') },
    async (request) => {
      const params = z.object({ accountId: z.uuid() }).parse(request.params);
      return playerDetail(db, params.accountId, clock.now());
    },
  );

  app.post(
    '/players/:accountId/ban',
    { preHandler: requirePermission('playersBan') },
    async (request, reply) => {
      const params = z.object({ accountId: z.uuid() }).parse(request.params);
      const body = banSchema.parse(request.body);
      await banAccount(db, staffOf(request), params.accountId, body.reason, request.ip);
      return reply.status(204).send();
    },
  );

  app.post(
    '/players/:accountId/unban',
    { preHandler: requirePermission('playersBan') },
    async (request, reply) => {
      const params = z.object({ accountId: z.uuid() }).parse(request.params);
      await unbanAccount(db, staffOf(request), params.accountId, request.ip);
      return reply.status(204).send();
    },
  );

  app.post(
    '/players/:accountId/ledger',
    { preHandler: requirePermission('playersLedger') },
    async (request) => {
      const params = z.object({ accountId: z.uuid() }).parse(request.params);
      const body = ledgerSchema.parse(request.body);
      const header = request.headers['idempotency-key'];
      if (typeof header !== 'string' || header.length < 8 || header.length > 200) {
        throw new PanelError(400, 'VALIDATION', 'Nagłówek Idempotency-Key jest wymagany');
      }
      return postStaffLedger(
        db,
        staffOf(request),
        params.accountId,
        { currency: body.currency, delta: body.delta, idempotencyKey: header },
        request.ip,
      );
    },
  );

  app.get('/audit', { preHandler: requirePermission('auditRead') }, async () => ({
    entries: await listAudit(db),
  }));

  app.get('/announcements', { preHandler: requirePermission('announcementsWrite') }, async () => {
    const rows = await db.select().from(announcements).orderBy(desc(announcements.createdAt));
    return {
      announcements: rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        enabled: row.enabled,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  });

  app.post(
    '/announcements',
    { preHandler: requirePermission('announcementsWrite') },
    async (request, reply) => {
      const body = announcementSchema.parse(request.body);
      const [row] = await db
        .insert(announcements)
        .values({ title: body.title, body: body.body, enabled: body.enabled })
        .returning();
      if (!row) throw new Error('INSERT nie zwrócił ogłoszenia');
      return reply.status(201).send({
        id: row.id,
        title: row.title,
        body: row.body,
        enabled: row.enabled,
        updatedAt: row.updatedAt.toISOString(),
      });
    },
  );

  app.post(
    '/announcements/:id/enabled',
    { preHandler: requirePermission('announcementsWrite') },
    async (request) => {
      const params = z.object({ id: z.uuid() }).parse(request.params);
      const body = enabledSchema.parse(request.body);
      const [row] = await db
        .update(announcements)
        .set({ enabled: body.enabled, updatedAt: clock.now() })
        .where(eq(announcements.id, params.id))
        .returning();
      if (!row) throw new PanelError(404, 'NOT_FOUND', 'Nie ma takiego ogłoszenia');
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        enabled: row.enabled,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  );

  app.get('/content', { preHandler: requirePermission('contentWrite') }, async () =>
    contentOverview(db),
  );

  app.put(
    '/content/records',
    { preHandler: requirePermission('contentWrite') },
    async (request) => {
      const body = recordSchema.parse(request.body);
      const draft = await writeRecord(db, body.collection, body.record);
      return { draft };
    },
  );

  app.delete(
    '/content/records',
    { preHandler: requirePermission('contentWrite') },
    async (request) => {
      const body = deleteSchema.parse(request.body);
      const draft = await deleteRecord(db, body.collection, body.id);
      return { draft };
    },
  );

  app.post(
    '/content/publish',
    { preHandler: requirePermission('contentPublish') },
    async (request) => {
      const staff = staffOf(request);
      return publishContent(db, staff.id, staff.email);
    },
  );

  app.post(
    '/content/rollback',
    { preHandler: requirePermission('contentPublish') },
    async (request) => {
      const body = rollbackSchema.parse(request.body);
      return rollbackContent(db, staffOf(request).id, body.revision);
    },
  );

  app.post(
    '/actions',
    { preHandler: requirePermission('contentWrite') },
    async (request, reply) => {
      const body = actionSchema.parse(request.body);
      const action = await startAction(db, body);
      return reply.status(201).send(action);
    },
  );

  app.get('/actions/:id', { preHandler: requirePermission('contentWrite') }, async (request) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    return readAction(db, params.id);
  });
}

function setCookie(reply: FastifyReply, config: PanelConfig, token: string, expiresAt: Date): void {
  void reply.setCookie(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}
