import { expect, test } from '@playwright/test';

import { expectNoHorizontalOverflow, newAccount, registerViaUi } from './helpers';

test('Etap 5: z domu widać port i giełdę', async ({ page }) => {
  test.setTimeout(60_000);
  await registerViaUi(page, newAccount());
  const port = page.getByRole('link', { name: 'Port →', exact: true });
  await port.evaluate((element) => {
    element.scrollIntoView({ block: 'center' });
  });
  await port.click();
  await expect(page).toHaveURL(/\/port$/);
  await expect(page.getByTestId('port-board')).toContainText('Giełda Portowa');
  await expect(page.getByText('Klucze i Sigile zostają przy tobie')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
