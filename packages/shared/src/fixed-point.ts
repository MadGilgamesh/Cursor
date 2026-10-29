/**
 * Arytmetyka stałoprzecinkowa dla formuł gry.
 *
 * Wszystkie modyfikatory procentowe wyrażamy w punktach bazowych (bp),
 * gdzie 10 000 bp = 100%. Wyniki są zawsze liczbami całkowitymi zaokrąglanymi
 * w dół, więc klient i serwer liczą dokładnie to samo.
 */

export const BP_SCALE = 10_000;

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} musi być bezpieczną liczbą całkowitą, otrzymano: ${value}`);
  }
}

/** Zwraca `value * bp / 10 000` zaokrąglone w dół (w stronę −∞). */
export function applyBp(value: number, bp: number): number {
  assertSafeInteger(value, 'value');
  assertSafeInteger(bp, 'bp');
  const product = value * bp;
  assertSafeInteger(product, 'value * bp');
  return Math.floor(product / BP_SCALE);
}

export function clampInt(value: number, min: number, max: number): number {
  assertSafeInteger(value, 'value');
  assertSafeInteger(min, 'min');
  assertSafeInteger(max, 'max');
  if (min > max) throw new RangeError(`min (${min}) nie może być większe niż max (${max})`);
  return Math.min(max, Math.max(min, value));
}
