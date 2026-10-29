import { ERROR_CODES } from '@game/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppDeps } from '../app.js';
import type { AppConfig } from '../config.js';
import type { AccountRow } from '../db/schema.js';
import { AppError } from '../errors.js';
import { assertAccountActive } from './ban.js';
import { findAccountBySessionToken, SESSION_COOKIE } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Zalogowane konto; ustawiane przez `requireAuth`. */
    account: AccountRow | null;
  }
}

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('account', null);
}

export function setSessionCookie(
  reply: FastifyReply,
  config: AppConfig,
  token: string,
  expiresAt: Date,
): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/api',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  void reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/api',
  });
}

export function requireAuth({ db, clock }: Pick<AppDeps, 'db' | 'clock'>) {
  return async (request: FastifyRequest): Promise<void> => {
    const token = request.cookies[SESSION_COOKIE];
    const account = token ? await findAccountBySessionToken(db, clock, token) : undefined;
    if (!account) {
      throw new AppError(401, ERROR_CODES.unauthorized, 'Sesja wygasła lub nie jesteś zalogowany');
    }
    await assertAccountActive(db, account.id);
    request.account = account;
  };
}

/** Zwraca konto ustawione przez `requireAuth` (wywołuj tylko w chronionych trasach). */
export function currentAccount(request: FastifyRequest): AccountRow {
  if (!request.account) throw new Error('Trasa wymaga hooka requireAuth');
  return request.account;
}
