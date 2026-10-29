import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';

import type { Clock } from '../clock.js';
import type { Database } from '../db/client.js';
import { accounts, sessions, type AccountRow } from '../db/schema.js';

export const SESSION_COOKIE = 'zb_session';

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  db: Pick<Database, 'insert'>,
  clock: Clock,
  accountId: string,
  ttlMs: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(clock.now().getTime() + ttlMs);
  await db.insert(sessions).values({ accountId, tokenHash: hashSessionToken(token), expiresAt });
  return { token, expiresAt };
}

export async function findAccountBySessionToken(
  db: Database,
  clock: Clock,
  token: string,
): Promise<AccountRow | undefined> {
  const [row] = await db
    .select({ account: accounts })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(
      and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, clock.now())),
    )
    .limit(1);
  return row?.account;
}

export async function deleteSession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}
