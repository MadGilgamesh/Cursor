/**
 * Księga walut (GDD 8.2 `WalletEntry`, 9.1). Zasady:
 * - saldo zmienia się tylko przez nowy wpis, w transakcji, z kluczem idempotencji;
 * - wpisy jednej postaci są serializowane blokadą wiersza postaci (brak double-spend);
 * - saldo to `balance_after` ostatniego wpisu, a zarazem suma wszystkich `delta`.
 */
import { CURRENCIES, type Currency, type Wallet } from '@game/shared';
import { and, desc, eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import { characters, walletEntries } from '../db/schema.js';

type Tx = Pick<Executor, 'select' | 'insert'>;

export class InsufficientFundsError extends Error {
  constructor(
    readonly currency: Currency,
    readonly balance: number,
    readonly requested: number,
  ) {
    super(`Brak środków: ${currency} saldo ${balance}, potrzeba ${requested}`);
    this.name = 'InsufficientFundsError';
  }
}

export interface LedgerEntryInput {
  characterId: string;
  currency: Currency;
  delta: number;
  reason: string;
  refId?: string;
  idempotencyKey: string;
}

export async function balanceOf(db: Tx, characterId: string, currency: Currency): Promise<number> {
  const [last] = await db
    .select({ balance: walletEntries.balanceAfter })
    .from(walletEntries)
    .where(and(eq(walletEntries.characterId, characterId), eq(walletEntries.currency, currency)))
    .orderBy(desc(walletEntries.seq))
    .limit(1);
  return last?.balance ?? 0;
}

export async function walletOf(db: Tx, characterId: string): Promise<Wallet> {
  const balances = await Promise.all(
    CURRENCIES.map(async (currency) => [currency, await balanceOf(db, characterId, currency)]),
  );
  return Object.fromEntries(balances) as Wallet;
}

/**
 * Dopisuje wpis do księgi. Powtórzony klucz idempotencji zwraca istniejący wpis
 * zamiast tworzyć nowy. Wywołuj wewnątrz transakcji.
 */
export async function postLedgerEntry(tx: Tx, input: LedgerEntryInput) {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
    throw new RangeError(`Niepoprawna zmiana salda: ${input.delta}`);
  }
  // Blokada wiersza postaci serializuje wszystkie zmiany jej portfela.
  await tx
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.id, input.characterId))
    .for('update');

  const [existing] = await tx
    .select()
    .from(walletEntries)
    .where(
      and(
        eq(walletEntries.characterId, input.characterId),
        eq(walletEntries.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const balance = await balanceOf(tx, input.characterId, input.currency);
  const balanceAfter = balance + input.delta;
  if (balanceAfter < 0) throw new InsufficientFundsError(input.currency, balance, -input.delta);

  const [entry] = await tx
    .insert(walletEntries)
    .values({
      characterId: input.characterId,
      currency: input.currency,
      delta: input.delta,
      balanceAfter,
      reason: input.reason,
      refId: input.refId ?? null,
      idempotencyKey: input.idempotencyKey,
    })
    .returning();
  if (!entry) throw new Error('INSERT nie zwrócił wpisu księgi');
  return entry;
}
