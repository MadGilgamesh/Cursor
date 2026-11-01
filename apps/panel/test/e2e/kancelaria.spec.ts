import { expect, test } from '@playwright/test';

import { screenshotPath } from '../shots.js';

const LIST_SHOT = screenshotPath('panel-lista-tresci.png');
const EVENT_SHOT = screenshotPath('panel-edytor-eventu.png');

test('kancelaria na widoku desktop', async ({ page }) => {
  await page.goto('/logowanie');
  await page.getByLabel('Login').fill('kustosz@sol.test');
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
  await expect(page.getByText(/Opublikowano rewizję \d+/)).toBeVisible();
  await expect(page.getByText(/Trwające akcje zostały przy swojej wersji/)).toBeVisible();
});

test('kancelaria na telefonie składa misję, walkę, historię i zadanie', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/logowanie');
  await page.getByLabel('Login').fill('kustosz@sol.test');
  await page.getByLabel('Hasło').fill('Latarnia-pamieci-1');
  await page.getByRole('button', { name: 'Wejdź' }).click();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Eventy' }).click();
  await page.getByRole('link', { name: 'Nowy event' }).click();
  await page.getByLabel('Nazwa').fill('Noc Zmarłych');
  await page.getByLabel('Opis').fill('Święto, które morze obchodzi bez nas.');
  await page.getByRole('button', { name: 'Dodaj misję' }).click();
  await page.getByLabel('Nazwa misji 1').fill('Patrol święta');
  await page.getByRole('button', { name: 'Dodaj walkę' }).click();
  await page.getByLabel('Nazwa walki 1').fill('Starcie na molo');
  await page.getByRole('button', { name: 'Dodaj historię' }).click();
  await page.getByLabel('Tytuł historii 1').fill('Skąd się wzięła Noc');
  await page.getByRole('button', { name: 'Dodaj zadanie' }).click();
  await page.getByLabel('Nazwa zadania 1').fill('Trzy łowy');
  const preview = page.getByTestId('event-preview');
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toContainText('Patrol święta');
  await expect(preview).toContainText('Starcie na molo');
  await expect(preview).toContainText('Skąd się wzięła Noc');
  await expect(preview).toContainText('Trzy łowy');
  await expect(preview).toContainText('Wygrana na Łowach × 1');
  await page.screenshot({ path: screenshotPath('panel-event-telefon.png') });
});
