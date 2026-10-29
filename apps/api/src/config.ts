import { z } from 'zod';

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
});

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
  };
}
