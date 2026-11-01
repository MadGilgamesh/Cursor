import { CURRENCIES, type Currency } from '@game/shared';

export const CURRENCY_LABELS: Record<Currency, string> = {
  silver: 'Srebro',
  bank: 'Kasa',
  pearls: 'Perły',
  wax: 'Wosk',
  vouchers: 'Kwity',
};

/** Dopełniacz w podglądzie nagrody eventu. */
export const CURRENCY_REWARD: Record<Currency, string> = {
  silver: 'srebra',
  bank: 'w Kasie',
  pearls: 'pereł',
  wax: 'wosku',
  vouchers: 'kwitów',
};

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}
