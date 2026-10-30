/**
 * Idempotencja żądań mutujących (GDD 9.2): klient dołącza nagłówek
 * `Idempotency-Key`; powtórka z tym samym kluczem zwraca zapisaną odpowiedź
 * zamiast ponownie wykonywać akcję (np. po zerwanym połączeniu na telefonie).
 *
 * 1. Rezerwacja klucza (osobny INSERT, widoczny od razu dla równoległych żądań).
 * 2. Akcja i zapis odpowiedzi w jednej transakcji z samą zmianą stanu gry.
 * 3. Błąd domenowy (4xx) też jest zapamiętywany; błąd nieoczekiwany zwalnia klucz.
 */
import { createHash } from 'node:crypto';

import { ERROR_CODES, IDEMPOTENCY_HEADER } from '@game/shared';
import { and, eq, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Executor } from './db/client.js';
import { idempotencyKeys } from './db/schema.js';
import { AppError } from './errors.js';

type Tx = Executor;

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/** Klucze starsze niż doba są usuwane przez zadanie konserwacyjne. */
export const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

function requestHash(request: FastifyRequest): string {
  const body = JSON.stringify(request.body ?? null);
  return createHash('sha256').update(`${request.method} ${request.url}\n${body}`).digest('hex');
}

export async function idempotent(
  db: Executor,
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  action: (tx: Tx) => Promise<{ statusCode: number; body: unknown }>,
): Promise<FastifyReply> {
  const header = request.headers[IDEMPOTENCY_HEADER];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key || !KEY_PATTERN.test(key)) {
    throw new AppError(
      400,
      ERROR_CODES.idempotencyKeyRequired,
      'Brak lub niepoprawny nagłówek Idempotency-Key',
    );
  }
  const hash = requestHash(request);
  const where = and(eq(idempotencyKeys.accountId, accountId), eq(idempotencyKeys.key, key));

  const [reserved] = await db
    .insert(idempotencyKeys)
    .values({ accountId, key, requestHash: hash })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });

  if (!reserved) {
    const [existing] = await db.select().from(idempotencyKeys).where(where).limit(1);
    if (existing?.requestHash !== hash) {
      throw new AppError(
        422,
        ERROR_CODES.idempotencyKeyReused,
        'Ten klucz idempotencji użyto już dla innego żądania',
      );
    }
    if (existing.statusCode === null) {
      throw new AppError(
        409,
        ERROR_CODES.idempotencyInProgress,
        'To żądanie jest już przetwarzane',
      );
    }
    return reply
      .status(existing.statusCode)
      .header('idempotent-replayed', 'true')
      .send(existing.responseBody);
  }

  try {
    const result = await db.transaction(async (tx) => {
      const outcome = await action(tx);
      await tx
        .update(idempotencyKeys)
        .set({ statusCode: outcome.statusCode, responseBody: outcome.body })
        .where(where);
      return outcome;
    });
    return await reply.status(result.statusCode).send(result.body);
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      await db
        .update(idempotencyKeys)
        .set({
          statusCode: error.statusCode,
          responseBody: { error: { code: error.code, message: error.message } },
        })
        .where(where);
    } else {
      await db.delete(idempotencyKeys).where(where);
    }
    throw error;
  }
}

export async function purgeExpiredIdempotencyKeys(db: Executor, now: Date): Promise<number> {
  const removed = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, new Date(now.getTime() - IDEMPOTENCY_KEY_TTL_MS)))
    .returning({ key: idempotencyKeys.key });
  return removed.length;
}
