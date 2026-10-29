import { STAFF_ROLES, type StaffRole } from './permissions.js';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3210),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  COOKIE_SECURE: z.stringbool().optional(),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 14)
    .default(12),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  PANEL_STAFF_EMAIL: z.string().optional(),
  PANEL_STAFF_PASSWORD: z.string().optional(),
  PANEL_STAFF_ROLE: z.enum(STAFF_ROLES).optional(),
});

export interface StaffBootstrap {
  email: string;
  password: string;
  role: StaffRole;
}

export interface PanelConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  cookieSecure: boolean;
  sessionTtlMs: number;
  authRateLimitMax: number;
  bootstrap: StaffBootstrap | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PanelConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Niepoprawna konfiguracja Kancelarii:\n${details}`);
  }
  const parsed = result.data;
  const email = parsed.PANEL_STAFF_EMAIL?.trim().toLowerCase();
  const password = parsed.PANEL_STAFF_PASSWORD;
  if (Boolean(email) !== Boolean(password)) {
    throw new Error(
      'Niepoprawna konfiguracja Kancelarii: PANEL_STAFF_EMAIL i PANEL_STAFF_PASSWORD ustaw razem',
    );
  }
  let bootstrap: StaffBootstrap | null = null;
  if (email && password) {
    bootstrap = { email, password, role: parsed.PANEL_STAFF_ROLE ?? 'administrator' };
  } else if (parsed.NODE_ENV === 'development') {
    bootstrap = {
      email: 'kustosz@sol.test',
      password: 'Latarnia-pamieci-1',
      role: 'administrator',
    };
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    cookieSecure: parsed.COOKIE_SECURE ?? parsed.NODE_ENV === 'production',
    sessionTtlMs: parsed.SESSION_TTL_HOURS * 60 * 60 * 1000,
    authRateLimitMax: parsed.AUTH_RATE_LIMIT_MAX,
    bootstrap,
  };
}
