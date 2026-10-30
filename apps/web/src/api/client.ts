import { apiErrorSchema, ERROR_CODES, IDEMPOTENCY_HEADER } from '@game/shared';
import type { z } from 'zod';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Schemat odpowiedzi — odpowiedź serwera jest zawsze walidowana. Brak = oczekujemy 204. */
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
  /** Klucz idempotencji akcji gry; ponowienie z tym samym kluczem jest bezpieczne. */
  idempotencyKey?: string;
}

export async function apiRequest<T = void>(
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.idempotencyKey) headers[IDEMPOTENCY_HEADER] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Brak połączenia z serwerem');
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
    throw parsed.success
      ? new ApiRequestError(response.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiRequestError(
          response.status,
          ERROR_CODES.internal,
          'Nieoczekiwana odpowiedź serwera',
        );
  }

  if (!options.schema) return undefined as T;
  return options.schema.parse(await response.json());
}

/** Ponawiamy tylko błędy sieci — z tym samym kluczem idempotencji, więc bez ryzyka podwójnej akcji. */
export const retryNetworkErrors = (failureCount: number, error: unknown) =>
  error instanceof ApiRequestError && error.status === 0 && failureCount < 3;
