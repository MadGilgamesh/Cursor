import { expect, test } from '@playwright/test';

import { expectNoHorizontalOverflow, newAccount, registerViaUi } from './helpers';

test('Etap 7: z domu widać próg', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await registerViaUi(page, newAccount());
  const door = page.getByRole('link', { name: 'Próg domu →', exact: true });
  await door.evaluate((element) => {
    element.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({ path: testInfo.outputPath('home.png') });
  await door.click();
  await expect(page).toHaveURL(/\/dom$/);
  await expect(page.getByRole('heading', { name: 'Dom' })).toBeVisible();
  await expect(page.getByTestId('hearth')).toContainText('Skażenie');
  await expect(page.getByText('Przysięga Śpiącym czeka na poniedziałek.')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('hearth.png') });
});
