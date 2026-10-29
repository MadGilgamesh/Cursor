import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const API_PORT = Number(process.env.E2E_PANEL_PORT ?? 3210);
const WEB_PORT = Number(process.env.E2E_PANEL_WEB_PORT ?? 4174);
const databaseUrl =
  process.env.PANEL_DATABASE_URL ?? 'postgres://game:game@localhost:5432/game_panel_e2e';

const serverEnv = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: String(API_PORT),
  LOG_LEVEL: 'warn',
  DATABASE_URL: databaseUrl,
  COOKIE_SECURE: 'false',
  AUTH_RATE_LIMIT_MAX: '1000',
  PANEL_STAFF_EMAIL: 'kustosz@sol.test',
  PANEL_STAFF_PASSWORD: 'Latarnia-pamieci-1',
  PANEL_STAFF_ROLE: 'administrator',
};

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['list']] : [['list']],
  outputDir: './test-results',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    locale: 'pl-PL',
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        locale: 'pl-PL',
      },
    },
  ],
  webServer: [
    {
      name: 'Kancelaria',
      command: 'node dist/server/main.js',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, ...serverEnv },
    },
    {
      name: 'Panel',
      command: `pnpm exec vite preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PANEL_API_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
