import { defineConfig, devices } from '@playwright/test';
import webpush from 'web-push';

const isCI = Boolean(process.env.CI);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4173);

// Klucze VAPID tylko na czas testów; zapisane w env, by procesy robocze Playwrighta widziały te same.
if (!process.env.E2E_VAPID_PUBLIC_KEY || !process.env.E2E_VAPID_PRIVATE_KEY) {
  const keys = webpush.generateVAPIDKeys();
  process.env.E2E_VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.E2E_VAPID_PRIVATE_KEY = keys.privateKey;
}

const serverEnv = {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  LOG_LEVEL: 'warn',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://game:game@localhost:5432/game',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  AUTH_RATE_LIMIT_MAX: '1000',
  VAPID_PUBLIC_KEY: process.env.E2E_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.E2E_VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: 'mailto:e2e@sol.test',
  // Zegar API z regulowanym przesunięciem i ręczne uruchamianie schedulera (tylko testy).
  ENABLE_TEST_CONTROLS: 'true',
};

/**
 * Testy uruchamiają zbudowane API (z migracjami), worker kolejki i klienta PWA
 * w `vite preview`. Zegar serwera jest wspólny dla wszystkich testów, więc
 * testy idą po kolei (jeden worker Playwrighta).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'pl-PL',
    // Animacje (mgła, znak) w WebKit potrafią uniemożliwić kliknięcie — element nigdy nie jest „stabilny”.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: [
    {
      name: 'API',
      cwd: '../apps/api',
      command: 'node dist/db/migrate.js && node dist/server.js',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: serverEnv,
    },
    {
      name: 'Worker',
      cwd: '../apps/api',
      command: 'node dist/worker.js',
      wait: { stdout: /Worker gotowy/ },
      reuseExistingServer: false,
      timeout: 60_000,
      env: serverEnv,
    },
    {
      name: 'PWA',
      cwd: '../apps/web',
      command: `pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
