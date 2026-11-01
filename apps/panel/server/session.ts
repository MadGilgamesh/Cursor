import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';

import type { Clock } from './clock.js';
import type { PanelDatabase } from './db.js';
import { staffAccounts, staffSessions } from './schema.js';
import type { StaffRole } from './permissions.js';

export const STAFF_COOKIE = 'zb_staff';

export interface StaffPrincipal {
  id: string;
  email: string;
  role: StaffRole;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createStaffSession(
  db: PanelDatabase,
  clock: Clock,
  staffId: string,
  ttlMs: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(clock.now().getTime() + ttlMs);
  await db.insert(staffSessions).values({
    staffId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function findStaffByToken(
  db: PanelDatabase,
  clock: Clock,
  token: string,
): Promise<StaffPrincipal | undefined> {
  const [row] = await db
    .select({
      id: staffAccounts.id,
      email: staffAccounts.email,
      role: staffAccounts.role,
    })
    .from(staffSessions)
    .innerJoin(staffAccounts, eq(staffAccounts.id, staffSessions.staffId))
    .where(
      and(
        eq(staffSessions.tokenHash, hashSessionToken(token)),
        gt(staffSessions.expiresAt, clock.now()),
      ),
    )
    .limit(1);
  return row;
}

export async function deleteStaffSession(db: PanelDatabase, token: string): Promise<void> {
  await db.delete(staffSessions).where(eq(staffSessions.tokenHash, hashSessionToken(token)));
}
