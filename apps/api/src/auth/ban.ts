import { ERROR_CODES } from '@game/shared';
import { sql } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';

/** Blokada z Kancelarii. Brak tabeli (świeża baza bez panelu) nie zatrzymuje logowania. */
export async function assertAccountActive(db: Database, accountId: string): Promise<void> {
  let rows: { hit: number }[];
  try {
    rows = await db.execute<{ hit: number }>(
      sql`select 1 as hit from account_bans where account_id = ${accountId}::uuid limit 1`,
    );
  } catch (error) {
    if (postgresCode(error) === '42P01') return;
    throw error;
  }
  if (rows.length > 0) {
    throw new AppError(403, ERROR_CODES.accountBanned, 'Konto jest zablokowane');
  }
}

function postgresCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
    const candidate = current as Error & { code?: string };
    if (typeof candidate.code === 'string') return candidate.code;
    current = current.cause;
  }
  return undefined;
}
