import { expect, test } from '@playwright/test';

import { expectNoHorizontalOverflow, newAccount, registerViaUi } from './helpers';

test('Etap 9: z domu widać Koniunkcję', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await registerViaUi(page, newAccount());
  const link = page.getByRole('link', { name: 'Koniunkcja →', exact: true });
  await link.evaluate((element) => {
    element.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({ path: testInfo.outputPath('home.png') });
  await link.click();
  await expect(page).toHaveURL(/\/koniunkcja$/);
  await expect(page.getByRole('heading', { name: 'Koniunkcja', exact: true })).toBeVisible();
  await expect(page.getByTestId('conjunction')).toContainText('Zegar Koniunkcji');
  await expect(page.getByTestId('conjunction')).toContainText('0.00%');
  await expect(page.getByText('Noc Zmarłych')).toBeVisible();
  await expect(page.getByText('Nyarlathotep')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('conjunction.png') });
});
