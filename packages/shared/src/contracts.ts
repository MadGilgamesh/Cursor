/**
 * Kontrakty HTTP API (schematy Zod) współdzielone przez klienta i serwer.
 * Serwer waliduje nimi wejście i wyjście, klient — formularze i odpowiedzi.
 *
 * Model zgodny z GDD (rozdz. 8): jedno konto (`Account`) ma dokładnie jedną
 * postać (`Character`). Publiczną tożsamością gracza jest imię postaci.
 */
import { z } from 'zod';

export const API_PREFIX = '/api/v1';

export const ERROR_CODES = {
  validation: 'VALIDATION_ERROR',
  unauthorized: 'UNAUTHORIZED',
  invalidCredentials: 'INVALID_CREDENTIALS',
  emailTaken: 'EMAIL_TAKEN',
  characterNameTaken: 'CHARACTER_NAME_TAKEN',
  rateLimited: 'RATE_LIMITED',
  notFound: 'NOT_FOUND',
  internal: 'INTERNAL_ERROR',
  insufficientResources: 'INSUFFICIENT_RESOURCES',
  activityBusy: 'ACTIVITY_BUSY',
  activityNotReady: 'ACTIVITY_NOT_READY',
  activityAlreadyClaimed: 'ACTIVITY_ALREADY_CLAIMED',
  idempotencyKeyRequired: 'IDEMPOTENCY_KEY_REQUIRED',
  idempotencyKeyReused: 'IDEMPOTENCY_KEY_REUSED',
  idempotencyInProgress: 'IDEMPOTENCY_IN_PROGRESS',
  pushUnavailable: 'PUSH_UNAVAILABLE',
} as const;

/**
 * Nagłówek idempotencji (GDD 9.2 `requestId`). Każde żądanie mutujące stan gry
 * musi go mieć; powtórka z tym samym kluczem zwraca zapisaną odpowiedź.
 */
export const IDEMPOTENCY_HEADER = 'idempotency-key';

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Adres e-mail jest za długi')
  .pipe(z.email('Podaj poprawny adres e-mail'));

export const CHARACTER_NAME_PATTERN = /^[\p{L}\p{N}_-]+$/u;

export const characterNameSchema = z
  .string()
  .trim()
  .min(3, 'Imię postaci musi mieć co najmniej 3 znaki')
  .max(20, 'Imię postaci może mieć najwyżej 20 znaków')
  .regex(CHARACTER_NAME_PATTERN, 'Dozwolone są litery, cyfry, „_” i „-”');

export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków`)
  .max(128, 'Hasło może mieć najwyżej 128 znaków');

export const registerRequestSchema = z.object({
  email: emailSchema,
  characterName: characterNameSchema,
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Podaj hasło').max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

const isoDateTime = z.iso.datetime({ offset: true });

export const accountSchema = z.object({
  id: z.uuid(),
  createdAt: isoDateTime,
});
export type Account = z.infer<typeof accountSchema>;

/** Postać — SZKIELET. Zasoby, statystyki, stan i miasto dojdą w Etapie 0/1 GDD. */
export const characterSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  level: z.int().min(1),
  experience: z.int().min(0),
  createdAt: isoDateTime,
});
export type Character = z.infer<typeof characterSchema>;

/** Odpowiedź `GET /me`, a także rejestracji i logowania. */
export const sessionResponseSchema = z.object({
  account: accountSchema,
  character: characterSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Zegar serwera — jedyne źródło czasu w grze (GDD 9.1). */
export const serverTimeResponseSchema = z.object({
  now: isoDateTime,
  epochMs: z.int(),
});
export type ServerTimeResponse = z.infer<typeof serverTimeResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: z.boolean(),
    redis: z.boolean(),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
