import { expect, test } from '@playwright/test';

import { screenshotPath } from '../shots.js';

const LIST_SHOT = screenshotPath('panel-lista-tresci.png');
const EVENT_SHOT = screenshotPath('panel-edytor-eventu.png');

test('kancelaria na widoku desktop', async ({ page }) => {
  await page.goto('/logowanie');
  await page.getByLabel('E-mail').fill('kustosz@sol.test');
  await page.getByLabel('Hasło').fill('zle-haslo-personelu');
  await page.getByRole('button', { name: 'Wejdź' }).click();
  await expect(page.getByText('Nieprawidłowy e-mail lub hasło personelu')).toBeVisible();

  await page.getByLabel('Hasło').fill('Latarnia-pamieci-1');
  await page.getByRole('button', { name: 'Wejdź' }).click();
  await expect(page.getByRole('heading', { name: 'Gracze' })).toBeVisible();

  await page.getByRole('link', { name: 'Treść' }).click();
  await expect(page.getByRole('heading', { name: 'Treść' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Szczur z Kanału' })).toBeVisible();
  await page.screenshot({ path: LIST_SHOT });

  await page.getByRole('link', { name: 'Eventy' }).click();
  await page.getByRole('link', { name: 'Nowy event' }).click();
  await expect(page.getByRole('heading', { name: 'Nowy event' })).toBeVisible();
  await page.getByLabel('Identyfikator').fill('event.noc-zmarlych');
  await page.getByLabel('Nazwa').fill('Noc Zmarłych');
  await page.getByLabel('Opis').fill('Święto, które morze obchodzi bez nas.');
  const start = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
  const end = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16);
  await page.getByLabel('Początek').fill(start);
  await page.getByLabel('Koniec').fill(end);
  await page.getByLabel('Kwota nagrody').fill('25');
  await page.getByRole('button', { name: 'Dodaj modyfikator' }).click();
  const preview = page.getByTestId('event-preview');
  await expect(preview).toContainText('Podgląd przed publikacją');
  await expect(preview).toContainText('Przed startem');
  await expect(preview).toContainText('UTC');
  await expect(preview).toContainText('25 srebra');
  await page.screenshot({ path: EVENT_SHOT });

  await page.getByRole('button', { name: 'Zapisz w szkicu' }).click();
  await expect(page.getByText('Zapisano w szkicu')).toBeVisible();
  await page.getByRole('link', { name: 'Publikacje' }).click();
  await expect(page.getByText('Rewizja 1')).toBeVisible();
  await page.getByRole('button', { name: 'Publikuj szkic' }).click();
  await expect(page.getByText(/Opublikowano rewizję 2/)).toBeVisible();
  await expect(page.getByText(/Trwające akcje zostały przy swojej wersji/)).toBeVisible();
});
