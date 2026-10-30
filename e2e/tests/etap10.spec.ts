import { expect, test } from '@playwright/test';

import { clickInView, expectNoHorizontalOverflow, newAccount, registerViaUi } from './helpers';

test('Etap 10: z domu widać Zstąpienie', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await registerViaUi(page, newAccount());
  const link = page.getByRole('link', { name: 'Zstąpienie →', exact: true });
  await page.screenshot({ path: testInfo.outputPath('home.png') });
  await clickInView(link);
  await expect(page).toHaveURL(/\/zstapienie$/);
  await expect(page.getByRole('heading', { name: 'Zstąpienie', exact: true })).toBeVisible();
  await expect(page.getByTestId('descent')).toContainText('poziomu 60');
  await expect(page.getByText('Yog-Sothoth')).toBeVisible();
  await expect(page.getByText('Azathoth')).toBeVisible();
  await expect(page.getByText('Ys-Kahal')).toBeVisible();
  await expect(page.getByText('Oko Czerni')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('descent.png') });
});
