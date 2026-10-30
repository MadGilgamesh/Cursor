import { expect, test } from '@playwright/test';

import { newAccount, registerViaUi } from './helpers';

test('Etap 2: Brama Srebrnego Klucza zużywa jeden klucz', async ({ page }) => {
  test.setTimeout(60_000);
  await registerViaUi(page, newAccount());
  await page.getByRole('link', { name: 'Mrok' }).click({ force: true });
  await page.getByRole('link', { name: 'Brama Srebrnego Klucza' }).click({ force: true });
  await expect(page.getByTestId('portal-key-count')).toContainText('Klucze Snu: 0');
  await page.request.post('/api/test/clock/advance', { data: { ms: 4 * 60 * 60_000 } });
  await page.reload();
  await expect(page.getByTestId('portal-key-count')).toContainText('Klucze Snu: 1');
  await page.getByRole('button', { name: 'Wejdź w sen' }).click({ force: true });
  await expect(page.getByTestId('portal-result')).toBeVisible();
  await expect(page.getByTestId('portal-key-count')).toContainText('Klucze Snu: 0');
});
