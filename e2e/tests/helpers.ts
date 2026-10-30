import { randomUUID } from 'node:crypto';

import { expect, type Locator, type Page } from '@playwright/test';

export interface TestAccount {
  email: string;
  characterName: string;
  password: string;
}

export function newAccount(): TestAccount {
  const suffix = randomUUID().slice(0, 8);
  return {
    email: `e2e-${suffix}@sol.test`,
    characterName: `Latarnik_${suffix}`,
    password: 'Matka-Latarnia-milczy',
  };
}

export async function registerViaUi(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/rejestracja');
  await page.getByLabel('E-mail').fill(account.email);
  await page.getByLabel('Imię postaci').fill(account.characterName);
  await page.getByLabel('Hasło').fill(account.password);
  await page.getByRole('button', { name: 'Przebudź się' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dom' })).toBeVisible();
}

export async function loginViaUi(page: Page, account: Pick<TestAccount, 'email' | 'password'>) {
  await page.goto('/logowanie');
  await page.getByLabel('E-mail').fill(account.email);
  await page.getByLabel('Hasło').fill(account.password);
  await page.getByRole('button', { name: 'Wejdź' }).click();
}

/**
 * WebKit nie kończy sprawdzania „stabilności”, dopóki cel jest poza ekranem,
 * więc sam klik nigdy nie dochodzi do przewinięcia. Najpierw środek widoku,
 * z dala od stałego paska, potem zwykły klik.
 */
export async function clickInView(locator: Locator): Promise<void> {
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
  await locator.click();
}

/** Na telefonie nic nie może wystawać poza szerokość ekranu. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
