import { expect, test } from '@playwright/test';

import { expectNoHorizontalOverflow, newAccount, registerViaUi } from './helpers';

test.describe('Dom i nawigacja dolna', () => {
  test.beforeEach(async ({ page }) => {
    await registerViaUi(page, newAccount());
  });

  test('pasek gracza pokazuje zasoby z GDD', async ({ page }) => {
    const resources = page.getByRole('list', { name: 'Zasoby' });
    for (const name of ['Życie', 'Wigor', 'Znój', 'Poczytalność']) {
      await expect(resources).toContainText(name);
    }
  });

  test('nawigacja dolna jest przypięta do dołu ekranu i przełącza zakładki', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Nawigacja główna' });
    await expect(nav).toBeVisible();

    const viewport = page.viewportSize();
    const box = await nav.boundingBox();
    expect(viewport).not.toBeNull();
    expect(box).not.toBeNull();
    expect(Math.round(box!.y + box!.height)).toBe(viewport!.height);

    const tabs = [
      { name: 'Miasto', url: /\/miasto$/ },
      { name: 'Mrok', url: /\/mrok$/ },
      { name: 'Postać', url: /\/postac$/ },
      { name: 'Wspólnota', url: /\/wspolnota$/ },
      { name: 'Dom', url: /\/$/ },
    ];
    for (const tab of tabs) {
      await nav.getByRole('link', { name: tab.name }).click();
      await expect(page).toHaveURL(tab.url);
      await expect(page.getByRole('heading', { level: 1, name: tab.name })).toBeVisible();
      await expect(nav.getByRole('link', { name: tab.name })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expectNoHorizontalOverflow(page);
    }
  });

  test('zrzut ekranu Domu na telefonie', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('heading', { level: 1, name: 'Dom' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const path = testInfo.outputPath(`dom-${testInfo.project.name}.png`);
    await page.screenshot({ path });
    await testInfo.attach('dom', { path, contentType: 'image/png' });
  });
});

test('aplikacja udostępnia manifest PWA', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    display: string;
    lang: string;
    icons: unknown[];
  };
  expect(manifest).toMatchObject({ name: 'Zapomniany Brzeg', display: 'standalone', lang: 'pl' });
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
});

test('API udostępnia czas serwera', async ({ request }) => {
  const response = await request.get('/api/v1/time');
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { epochMs: number };
  // Testy przesuwają zegar serwera tylko naprzód.
  expect(body.epochMs).toBeGreaterThan(Date.now() - 60_000);
});
