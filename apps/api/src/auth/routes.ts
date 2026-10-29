import {
  CHARACTER_START_LEVEL,
  ERROR_CODES,
  loginRequestSchema,
  registerRequestSchema,
} from '@game/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app.js';
import { playerActor, writeAudit } from '../audit.js';
import { insertStartingStats } from '../game/avatar.js';
import { insertPortalState } from '../game/portal-state.js';
import { initialResources, insertResources, resourceContext } from '../game/resources.js';
import { accounts, characters } from '../db/schema.js';
import { AppError, uniqueViolationConstraint } from '../errors.js';
import { toSessionResponse } from '../serializers.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password.js';
import { clearSessionCookie, setSessionCookie } from './plugin.js';
import { createSession, deleteSession, SESSION_COOKIE } from './session.js';

export function authRoutes(app: FastifyInstance, { db, config, clock }: AppDeps): void {
  const rateLimited = {
    config: { rateLimit: { max: config.authRateLimitMax, timeWindow: '1 minute' } },
  };

  /** Rejestracja tworzy konto i jego jedyną postać w jednej transakcji. */
  app.post('/register', rateLimited, async (request, reply) => {
    const input = registerRequestSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);

    const created = await db
      .transaction(async (tx) => {
        const [account] = await tx
          .insert(accounts)
          .values({ email: input.email, passwordHash })
          .returning();
        if (!account) throw new Error('INSERT nie zwrócił konta');
        const [character] = await tx
          .insert(characters)
          .values({
            accountId: account.id,
            name: input.characterName,
            level: CHARACTER_START_LEVEL,
            experience: 0,
          })
          .returning();
        if (!character) throw new Error('INSERT nie zwrócił postaci');
        const now = clock.now();
        await insertResources(
          tx,
          character.id,
          initialResources(resourceContext(character.level), now),
        );
        await insertStartingStats(tx, character.id);
        await insertPortalState(tx, character.id, now);
        await writeAudit(tx, playerActor(request, account.id), {
          action: 'account.register',
          characterId: character.id,
          after: { characterName: character.name },
        });
        const session = await createSession(tx, clock, account.id, config.sessionTtlMs);
        return { account, character, session };
      })
      .catch((error: unknown) => {
        const constraint = uniqueViolationConstraint(error);
        if (constraint === 'accounts_email_unique') {
          throw new AppError(409, ERROR_CODES.emailTaken, 'Ten adres e-mail jest już zajęty');
        }
        if (constraint === 'characters_name_lower_unique') {
          throw new AppError(409, ERROR_CODES.characterNameTaken, 'To imię nosi już inna postać');
        }
        throw error;
      });

    setSessionCookie(reply, config, created.session.token, created.session.expiresAt);
    return reply.status(201).send(toSessionResponse(created.account, created.character));
  });

  app.post('/login', rateLimited, async (request, reply) => {
    const input = loginRequestSchema.parse(request.body);
    const [row] = await db
      .select({ account: accounts, character: characters })
      .from(accounts)
      .innerJoin(characters, eq(characters.accountId, accounts.id))
      .where(eq(accounts.email, input.email))
      .limit(1);

    if (!row) {
      await burnPasswordCheck(input.password);
    }
    if (!row || !(await verifyPassword(row.account.passwordHash, input.password))) {
      throw new AppError(401, ERROR_CODES.invalidCredentials, 'Nieprawidłowy e-mail lub hasło');
    }

    await db
      .update(accounts)
      .set({ lastLoginAt: clock.now() })
      .where(eq(accounts.id, row.account.id));
    const session = await createSession(db, clock, row.account.id, config.sessionTtlMs);
    await writeAudit(db, playerActor(request, row.account.id), {
      action: 'account.login',
      characterId: row.character.id,
    });
    setSessionCookie(reply, config, session.token, session.expiresAt);
    return reply.send(toSessionResponse(row.account, row.character));
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    clearSessionCookie(reply, config);
    return reply.status(204).send();
  });
}
