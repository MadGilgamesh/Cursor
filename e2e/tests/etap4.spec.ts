import { expect, test } from '@playwright/test';

import { expectNoHorizontalOverflow, newAccount, registerViaUi } from './helpers';

test('Etap 4: z domu widać Sól, a droga rusza do Ilmaru', async ({ page }) => {
  test.setTimeout(60_000);
  await registerViaUi(page, newAccount());
  await expect(page.getByTestId('home-city')).toContainText('Sól');
  const road = page.getByRole('link', { name: 'Droga' });
  await road.evaluate((element) => {
    element.scrollIntoView({ block: 'center' });
  });
  await road.click();
  await expect(page).toHaveURL(/\/droga$/);
  await expect(page.getByTestId('road-city')).toContainText('Sól');
  await expect(page.getByTestId('road-garden')).toContainText('poziomu 8');
  await page.getByRole('button', { name: 'Rusz do Ilmaru' }).click();
  await expect(page.getByTestId('road-travel')).toContainText('W drodze');
  await expectNoHorizontalOverflow(page);
});
