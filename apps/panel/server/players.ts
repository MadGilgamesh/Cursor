import {
  CURRENCIES,
  RESOURCE_KINDS,
  materializeResource,
  resourceMax,
  type Currency,
  type ResourceKind,
} from '@game/shared';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import type { PanelDatabase } from './db.js';
import { PanelError } from './errors.js';
import type { StaffPrincipal } from './session.js';
import {
  accountBans,
  accounts,
  auditLog,
  characterStats,
  characters,
  resourceStates,
  sessions,
  walletEntries,
} from './schema.js';

const STATUS_LABELS: Record<string, string> = {
  ok: 'Przytomna',
  dead: 'Przytułek',
  broken: 'Sanatorium',
};

function likePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, '').slice(0, 80)}%`;
}

export async function listPlayers(db: PanelDatabase, query: string) {
  const pattern = query.trim() ? likePattern(query) : null;
  return db
    .select({
      accountId: accounts.id,
      email: accounts.email,
      createdAt: accounts.createdAt,
      lastLoginAt: accounts.lastLoginAt,
      characterId: characters.id,
      name: characters.name,
      level: characters.level,
      banned: sql<boolean>`${accountBans.accountId} is not null`.as('banned'),
    })
    .from(accounts)
    .innerJoin(characters, eq(characters.accountId, accounts.id))
    .leftJoin(accountBans, eq(accountBans.accountId, accounts.id))
    .where(
      pattern ? or(ilike(characters.name, pattern), ilike(accounts.email, pattern)) : undefined,
    )
    .orderBy(desc(accounts.createdAt))
    .limit(50);
}

async function loadPlayer(db: PanelDatabase, accountId: string) {
  const [row] = await db
    .select({
      account: accounts,
      character: characters,
      banReason: accountBans.reason,
    })
    .from(accounts)
    .leftJoin(characters, eq(characters.accountId, accounts.id))
    .leftJoin(accountBans, eq(accountBans.accountId, accounts.id))
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!row) throw new PanelError(404, 'NOT_FOUND', 'Nie ma takiego gracza');
  return row;
}

function resourceSnapshot(
  row: typeof resourceStates.$inferSelect,
  kind: ResourceKind,
): { value: number; updatedAt: number } {
  switch (kind) {
    case 'life':
      return { value: row.life, updatedAt: row.lifeUpdatedAt.getTime() };
    case 'vigor':
      return { value: row.vigor, updatedAt: row.vigorUpdatedAt.getTime() };
    case 'toil':
      return { value: row.toil, updatedAt: row.toilUpdatedAt.getTime() };
    case 'sanity':
      return { value: row.sanity, updatedAt: row.sanityUpdatedAt.getTime() };
  }
}

export async function playerDetail(db: PanelDatabase, accountId: string, now: Date) {
  const row = await loadPlayer(db, accountId);
  const character = row.character;
  const resources = character
    ? await db
        .select()
        .from(resourceStates)
        .where(eq(resourceStates.characterId, character.id))
        .limit(1)
    : [];
  const stats = character
    ? await db
        .select()
        .from(characterStats)
        .where(eq(characterStats.characterId, character.id))
        .limit(1)
    : [];
  const walletRows = character
    ? await db
        .selectDistinctOn([walletEntries.currency], {
          currency: walletEntries.currency,
          balance: walletEntries.balanceAfter,
        })
        .from(walletEntries)
        .where(eq(walletEntries.characterId, character.id))
        .orderBy(walletEntries.currency, desc(walletEntries.seq))
    : [];
  const balances = Object.fromEntries(CURRENCIES.map((currency) => [currency, 0])) as Record<
    Currency,
    number
  >;
  for (const entry of walletRows) {
    if ((CURRENCIES as readonly string[]).includes(entry.currency)) {
      balances[entry.currency as Currency] = entry.balance;
    }
  }
  const stored = resources[0];
  const level = character?.level ?? 1;
  return {
    account: {
      id: row.account.id,
      email: row.account.email,
      createdAt: row.account.createdAt.toISOString(),
      lastLoginAt: row.account.lastLoginAt?.toISOString() ?? null,
      banned: row.banReason !== null,
      banReason: row.banReason,
    },
    character: character
      ? {
          id: character.id,
          name: character.name,
          level: character.level,
          experience: character.experience,
          status: stats[0] ? (STATUS_LABELS[stats[0].status] ?? stats[0].status) : null,
          circle: stats[0]?.circle ?? null,
          hall: stats[0]?.hall ?? null,
        }
      : null,
    resources: RESOURCE_KINDS.map((kind) => {
      const max = resourceMax(kind, { level, knowledge: 0 });
      if (!stored) return { kind, value: null, max };
      const current = materializeResource(kind, resourceSnapshot(stored, kind), now.getTime(), max);
      return { kind, value: current.value, max };
    }),
    wallet: CURRENCIES.map((currency) => ({ currency, balance: balances[currency] })),
  };
}

export async function banAccount(
  db: PanelDatabase,
  staff: StaffPrincipal,
  accountId: string,
  reason: string,
  ip: string | undefined,
): Promise<void> {
  const row = await loadPlayer(db, accountId);
  if (row.banReason !== null) throw new PanelError(409, 'CONFLICT', 'Konto jest już zablokowane');
  await db.transaction(async (tx) => {
    await tx.insert(accountBans).values({ accountId, reason, staffId: staff.id });
    await tx.delete(sessions).where(eq(sessions.accountId, accountId));
    await tx.insert(auditLog).values({
      accountId,
      characterId: row.character?.id ?? null,
      actor: 'system',
      action: 'staff.ban',
      before: { banned: false },
      after: { banned: true, reason, staffId: staff.id, staffEmail: staff.email },
      ip: ip ?? null,
    });
  });
}

export async function unbanAccount(
  db: PanelDatabase,
  staff: StaffPrincipal,
  accountId: string,
  ip: string | undefined,
): Promise<void> {
  const row = await loadPlayer(db, accountId);
  if (row.banReason === null) throw new PanelError(409, 'CONFLICT', 'Konto nie jest zablokowane');
  await db.transaction(async (tx) => {
    await tx.delete(accountBans).where(eq(accountBans.accountId, accountId));
    await tx.insert(auditLog).values({
      accountId,
      characterId: row.character?.id ?? null,
      actor: 'system',
      action: 'staff.unban',
      before: { banned: true, reason: row.banReason },
      after: { banned: false, staffId: staff.id, staffEmail: staff.email },
      ip: ip ?? null,
    });
  });
}

export async function postStaffLedger(
  db: PanelDatabase,
  staff: StaffPrincipal,
  accountId: string,
  input: { currency: Currency; delta: number; idempotencyKey: string },
  ip: string | undefined,
) {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
    throw new PanelError(400, 'VALIDATION', 'Zmiana salda musi być niezerową liczbą całkowitą');
  }
  const row = await loadPlayer(db, accountId);
  if (!row.character) throw new PanelError(404, 'NOT_FOUND', 'Konto nie ma postaci');
  const characterId = row.character.id;
  const idempotencyKey = `staff:${staff.id}:${input.idempotencyKey}`;
  return db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.id, characterId))
      .for('update');
    if (!locked[0]) throw new PanelError(404, 'NOT_FOUND', 'Nie ma takiej postaci');
    const [existing] = await tx
      .select()
      .from(walletEntries)
      .where(
        and(
          eq(walletEntries.characterId, characterId),
          eq(walletEntries.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        seq: existing.seq,
        currency: existing.currency,
        delta: existing.delta,
        balanceAfter: existing.balanceAfter,
        replayed: true,
      };
    }
    const [last] = await tx
      .select({ balance: walletEntries.balanceAfter })
      .from(walletEntries)
      .where(
        and(eq(walletEntries.characterId, characterId), eq(walletEntries.currency, input.currency)),
      )
      .orderBy(desc(walletEntries.seq))
      .limit(1);
    const balance = last?.balance ?? 0;
    const balanceAfter = balance + input.delta;
    if (balanceAfter < 0) {
      throw new PanelError(409, 'INSUFFICIENT_FUNDS', 'Za mało środków w księdze, by tyle odjąć');
    }
    const reason = input.delta > 0 ? 'staff.grant' : 'staff.revoke';
    const [entry] = await tx
      .insert(walletEntries)
      .values({
        characterId,
        currency: input.currency,
        delta: input.delta,
        balanceAfter,
        reason,
        refId: staff.id,
        idempotencyKey,
      })
      .returning();
    if (!entry) throw new Error('INSERT nie zwrócił wpisu księgi');
    await tx.insert(auditLog).values({
      accountId,
      characterId,
      actor: 'system',
      action: reason,
      before: { currency: input.currency, balance },
      after: {
        currency: input.currency,
        delta: input.delta,
        balance: balanceAfter,
        staffId: staff.id,
        staffEmail: staff.email,
        idempotencyKey,
      },
      ip: ip ?? null,
    });
    return {
      seq: entry.seq,
      currency: entry.currency,
      delta: entry.delta,
      balanceAfter: entry.balanceAfter,
      replayed: false,
    };
  });
}

export async function listAudit(db: PanelDatabase) {
  const rows = await db
    .select({
      id: auditLog.id,
      accountId: auditLog.accountId,
      email: accounts.email,
      characterId: auditLog.characterId,
      actor: auditLog.actor,
      action: auditLog.action,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(accounts, eq(accounts.id, auditLog.accountId))
    .orderBy(desc(auditLog.createdAt))
    .limit(100);
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}
