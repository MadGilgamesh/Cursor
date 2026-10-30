import { expect, test } from '@playwright/test';

import { expectNoHorizontalOverflow, newAccount, registerViaUi } from './helpers';

test('Etap 8: z domu widać wyprawy', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await registerViaUi(page, newAccount());
  const link = page.getByRole('link', { name: 'Wyprawy →', exact: true });
  await link.evaluate((element) => {
    element.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({ path: testInfo.outputPath('home.png') });
  await link.click();
  await expect(page).toHaveURL(/\/wyprawy$/);
  await expect(page.getByRole('heading', { name: 'Wyprawy', exact: true })).toBeVisible();
  await expect(page.getByTestId('expeditions')).toContainText('Kanały pod Solą');
  await expect(page.getByText('Lodowe Krypty Kresu')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('expeditions.png') });
});
