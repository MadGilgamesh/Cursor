import { z } from 'zod';

/** Pusta zmienna (np. `VAPID_PUBLIC_KEY=` z docker-compose) oznacza brak wartości. */
const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  /** Domyślnie `true` na produkcji. Wyłącz tylko przy lokalnym HTTP spoza localhost. */
  COOKIE_SECURE: z.stringbool().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Limit żądań do endpointów logowania/rejestracji na adres IP w oknie minuty. */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  /** Liczba proxy (np. nginx) przed API — potrzebna do poprawnego odczytu IP klienta. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  /** Klucze VAPID dla Web Push (`pnpm --filter @game/api vapid:generate`). Bez nich push jest wyłączony. */
  VAPID_PUBLIC_KEY: optionalSecret,
  VAPID_PRIVATE_KEY: optionalSecret,
  VAPID_SUBJECT: z.string().default('mailto:admin@zapomniany-brzeg.invalid'),
  /** Endpointy sterujące zegarem i schedulerem — wyłącznie dla testów E2E, nigdy na produkcji. */
  ENABLE_TEST_CONTROLS: z.stringbool().default(false),
});

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  redisUrl: string;
  cookieSecure: boolean;
  sessionTtlMs: number;
  authRateLimitMax: number;
  trustProxyHops: number;
  vapid: VapidConfig | null;
  enableTestControls: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Niepoprawna konfiguracja środowiska:\n${details}`);
  }
  const parsed = result.data;
  if (parsed.ENABLE_TEST_CONTROLS && parsed.NODE_ENV === 'production') {
    throw new Error('Niepoprawna konfiguracja środowiska: ENABLE_TEST_CONTROLS na produkcji');
  }
  if (Boolean(parsed.VAPID_PUBLIC_KEY) !== Boolean(parsed.VAPID_PRIVATE_KEY)) {
    throw new Error(
      'Niepoprawna konfiguracja środowiska: VAPID_PUBLIC_KEY i VAPID_PRIVATE_KEY ustaw razem',
    );
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    cookieSecure: parsed.COOKIE_SECURE ?? parsed.NODE_ENV === 'production',
    sessionTtlMs: parsed.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    authRateLimitMax: parsed.AUTH_RATE_LIMIT_MAX,
    trustProxyHops: parsed.TRUST_PROXY_HOPS,
    vapid:
      parsed.VAPID_PUBLIC_KEY && parsed.VAPID_PRIVATE_KEY
        ? {
            publicKey: parsed.VAPID_PUBLIC_KEY,
            privateKey: parsed.VAPID_PRIVATE_KEY,
            subject: parsed.VAPID_SUBJECT,
          }
        : null,
    enableTestControls: parsed.ENABLE_TEST_CONTROLS,
  };
}
