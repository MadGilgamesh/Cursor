import { describe, expect, it } from 'vitest';

import { ApiRequestError } from '../src/api/client';
import { errorMessage, formatDuration, t } from '../src/i18n';

describe('i18n', () => {
  it('podstawia parametry i zostawia nieznane bez zmian', () => {
    expect(t('resources.level', { level: 7 })).toBe('Poziom 7');
    expect(t('city.cost', {})).toBe('{cost} Wigoru');
  });

  it('formatuje czasy trwania', () => {
    expect(formatDuration(0)).toBe('chwilę');
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(5 * 60_000)).toBe('5 min');
    expect(formatDuration(60 * 60_000)).toBe('1 h');
    expect(formatDuration(200 * 60_000)).toBe('3 h 20 min');
    expect(formatDuration(-5)).toBe('chwilę');
  });

  it('tłumaczy kody błędów API, a nieznane zostawia z treścią serwera', () => {
    expect(errorMessage(new ApiRequestError(409, 'INSUFFICIENT_RESOURCES', 'x'))).toBe(
      'Za mało Wigoru.',
    );
    expect(errorMessage(new ApiRequestError(400, 'NIEZNANY', 'Tekst serwera'))).toBe(
      'Tekst serwera',
    );
  });
});
