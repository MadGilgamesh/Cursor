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

/**
 * WebKit w Playwright nie kończy sprawdzania „stabilności”, gdy cel jest przy
 * stałym pasku albo poza kadrem, a wymuszony klik w środek trafia w oko Mroku.
 * Zdarzenie idzie wprost do elementu.
 */
export async function clickInView(locator: Locator): Promise<void> {
  await locator.evaluate((element: HTMLElement) => {
    element.click();
  });
}

export async function registerViaUi(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/rejestracja');
  await page.getByLabel('E-mail').fill(account.email);
  await page.getByLabel('Imię postaci').fill(account.characterName);
  await page.getByLabel('Hasło').fill(account.password);
  await clickInView(page.getByRole('button', { name: 'Przebudź się' }));
  await expect(page.getByRole('heading', { level: 1, name: 'Dom' })).toBeVisible();
}

export async function loginViaUi(page: Page, account: Pick<TestAccount, 'email' | 'password'>) {
  await page.goto('/logowanie');
  await page.getByLabel('E-mail').fill(account.email);
  await page.getByLabel('Hasło').fill(account.password);
  await clickInView(page.getByRole('button', { name: 'Wejdź' }));
}

/** Na telefonie nic nie może wystawać poza szerokość ekranu. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
