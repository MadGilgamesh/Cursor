import { ApiRequestError } from '../api/client';
import { pl, type Messages } from './pl';

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;

/** Aktywny katalog. Wybór języka (np. z ustawień konta) dojdzie wraz z drugim językiem. */
const messages: Messages = pl;
export const locale = 'pl-PL';

function lookup(key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = lookup(key) ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Czas trwania w czytelnej postaci: „45 s”, „12 min”, „1 h 20 min”. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  if (totalSeconds === 0) return t('duration.now');
  if (totalSeconds < 60) return t('duration.seconds', { n: totalSeconds });
  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) return t('duration.minutes', { n: totalMinutes });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0
    ? t('duration.hours', { n: hours })
    : t('duration.hoursMinutes', { h: hours, m: minutes });
}

/** Komunikat błędu dla gracza: tłumaczenie kodu, a w ostateczności tekst z serwera. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const translated = lookup(`errors.${error.code}`);
    return translated ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
