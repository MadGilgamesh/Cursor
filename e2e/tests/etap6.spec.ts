import { expect, test } from '@playwright/test';

import { expectNoHorizontalOverflow, newAccount, registerViaUi } from './helpers';

test('Etap 6: z domu widać salę lóż', async ({ page }) => {
  test.setTimeout(60_000);
  await registerViaUi(page, newAccount());
  const hall = page.getByRole('link', { name: 'Sala Lóż →', exact: true });
  await hall.evaluate((element) => {
    element.scrollIntoView({ block: 'center' });
  });
  await hall.click();
  await expect(page).toHaveURL(/\/wspolnota$/);
  await expect(page.getByTestId('lodge-hall')).toContainText('Sala Lóż');
  await expect(page.getByText('Przebudzenie Boga')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
