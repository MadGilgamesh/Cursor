import { expect, test } from '@playwright/test';

import {
  clickInView,
  expectNoHorizontalOverflow,
  loginViaUi,
  newAccount,
  registerViaUi,
} from './helpers';

test('niezalogowany gracz trafia na ekran logowania', async ({ page }) => {
  await page.goto('/postac');
  await expect(page).toHaveURL(/\/logowanie$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Zapomniany Brzeg' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Powrót na Brzeg' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('pełny cykl: rejestracja → Dom → wylogowanie → logowanie', async ({ page }) => {
  const account = newAccount();

  await registerViaUi(page, account);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('character-name')).toHaveText(account.characterName);
  await expect(page.getByRole('region', { name: 'Twoja postać' })).toContainText('Poz. 1');

  // Sesja przetrwa przeładowanie strony (ciasteczko httpOnly).
  await page.reload();
  await expect(page.getByTestId('character-name')).toHaveText(account.characterName);

  await page.getByRole('link', { name: 'Postać' }).click();
  await expect(page).toHaveURL(/\/postac$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Postać' })).toBeVisible();
  await clickInView(page.getByRole('button', { name: 'Wyloguj' }));
  await expect(page).toHaveURL(/\/logowanie$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/logowanie$/);

  await loginViaUi(page, account);
  await expect(page.getByRole('heading', { level: 1, name: 'Dom' })).toBeVisible();
  await expect(page.getByTestId('character-name')).toHaveText(account.characterName);
});

test('błędne hasło pokazuje komunikat i nie loguje', async ({ page }) => {
  const account = newAccount();
  await registerViaUi(page, account);
  await page.context().clearCookies();

  await loginViaUi(page, { email: account.email, password: 'zupełnie-złe-hasło' });
  await expect(page.getByRole('alert')).toHaveText('Nieprawidłowy e-mail lub hasło');
  await expect(page).toHaveURL(/\/logowanie$/);
});

test('rejestracja odrzuca zajęte imię postaci', async ({ page }) => {
  const account = newAccount();
  await registerViaUi(page, account);
  await page.context().clearCookies();

  await page.goto('/rejestracja');
  await page.getByLabel('E-mail').fill(`inny-${account.email}`);
  await page.getByLabel('Imię postaci').fill(account.characterName.toUpperCase());
  await page.getByLabel('Hasło').fill(account.password);
  await page.getByRole('button', { name: 'Przebudź się' }).click();
  await expect(page.getByRole('alert')).toHaveText('To imię nosi już inna postać');
});
