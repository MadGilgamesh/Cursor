import { Redis } from 'ioredis';

export function createRedis(url: string): Redis {
  return new Redis(url, {
    // Wymagane przez BullMQ dla połączeń blokujących; dla zwykłych zapytań nie szkodzi.
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });
}

export type { Redis };
