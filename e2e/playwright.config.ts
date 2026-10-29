import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4173);

/** Testy uruchamiają zbudowane API (z migracjami) i zbudowany klient PWA w `vite preview`. */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'pl-PL',
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
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        LOG_LEVEL: 'warn',
        DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://game:game@localhost:5432/game',
        REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
        AUTH_RATE_LIMIT_MAX: '1000',
      },
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
