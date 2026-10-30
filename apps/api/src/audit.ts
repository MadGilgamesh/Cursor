import type { FastifyRequest } from 'fastify';

import type { Executor } from './db/client.js';
import { auditLog } from './db/schema.js';

/** Kto i skąd wykonuje akcję — dołączane do każdego wpisu audytu. */
export interface AuditActor {
  actor: 'player' | 'system';
  accountId: string | null;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export const systemActor = (accountId: string | null = null): AuditActor => ({
  actor: 'system',
  accountId,
});

export function playerActor(request: FastifyRequest, accountId: string): AuditActor {
  return {
    actor: 'player',
    accountId,
    ip: request.ip,
    userAgent: request.headers['user-agent']?.slice(0, 512),
  };
}

export interface AuditEntry {
  action: string;
  characterId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Zapisuje wpis w tej samej transakcji co zmiana, której dotyczy (GDD 9.2). */
export async function writeAudit(
  db: Pick<Executor, 'insert'>,
  who: AuditActor,
  entry: AuditEntry,
): Promise<void> {
  await db.insert(auditLog).values({
    accountId: who.accountId,
    characterId: entry.characterId ?? null,
    actor: who.actor,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: who.ip ?? null,
    userAgent: who.userAgent ?? null,
  });
}
