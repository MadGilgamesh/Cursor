import { expect, test } from '@playwright/test';

import { clickInView, expectNoHorizontalOverflow, newAccount, registerViaUi } from './helpers';

test('Etap 3: notatnik otwiera Sprawę, a odpowiedź nie zdradza rozwiązania', async ({ page }) => {
  test.setTimeout(60_000);
  await registerViaUi(page, newAccount());
  const notebook = page.getByRole('link', { name: 'Otwórz notatnik' });
  await expect(page.getByTestId('lore-knowledge')).toBeVisible();
  await clickInView(notebook);
  await expect(page).toHaveURL(/\/wiedza$/);
  await expect(page.getByTestId('lore-factions')).toBeVisible();
  await expect(page.getByTestId('lore-bestiary')).toContainText('Odkryte strony: 0');
  await clickInView(page.getByRole('button', { name: 'Otwórz sprawę' }));
  await expect(page.getByText('Kto?', { exact: true })).toBeVisible();
  await clickInView(page.getByRole('button', { name: 'Przeszukanie: Kto?' }));
  await expect(page.getByRole('button', { name: /Trop: wskazanie/ })).toBeVisible();

  const lore = await page.request.get('/api/v1/lore');
  expect(lore.ok()).toBe(true);
  const body = await lore.text();
  expect(body).not.toContain('pointsAt');
  expect(body).not.toContain('"solution"');
  expect(body).not.toContain('"seed"');
  await expectNoHorizontalOverflow(page);
});
