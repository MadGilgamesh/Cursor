import { expect, test, type Page } from '@playwright/test';

import { newAccount, registerViaUi } from './helpers';

const MINUTE = 60_000;

/** Przesuwa zegar serwera (endpoint dostępny tylko przy ENABLE_TEST_CONTROLS). */
async function advanceServerClock(page: Page, ms: number) {
  const response = await page.request.post('/api/test/clock/advance', { data: { ms } });
  expect(response.ok()).toBe(true);
}

const resource = (page: Page, kind: string) => page.getByTestId(`resource-${kind}`);

test.describe('Etap 0 — główna ścieżka (GDD 11)', () => {
  test('rejestracja → zlecenie zużywa Wigor → nagroda do księgi → Wigor rośnie z czasem serwera', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    // Bez animacji przejść — zrzut ekranu na końcu ma pokazać stan ustalony.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await registerViaUi(page, newAccount());

    // Pełne zasoby i puste Srebro nowej postaci.
    await expect(resource(page, 'vigor')).toHaveAccessibleName('Wigor: 100/100, pełne');
    await expect(resource(page, 'life')).toHaveAccessibleName('Życie: 100/100, pełne');
    await expect(page.getByTestId('wallet-silver')).toHaveText('Srebro: 0');

    // „Następny krok” prowadzi do tablicy zleceń — bez martwego końca.
    await expect(page.getByTestId('next-step')).toHaveText(
      'Masz 100 Wigoru. Weź zlecenie z tablicy Urzędu.',
    );
    const boardLink = page.getByRole('link', { name: /Tablica zleceń/ });
    await boardLink.click({ force: true });
    if (!/\/miasto$/.test(page.url())) await boardLink.click({ force: true });
    await expect(page).toHaveURL(/\/miasto$/);

    await page
      .getByRole('button', { name: 'Rozpocznij: Przeszukanie wraku przy falochronie' })
      .click({ force: true });
    await expect(page).toHaveURL(/\/$/);

    // Start pobrał 5 Wigoru; timer odlicza na Domu.
    await expect(resource(page, 'vigor')).toHaveAccessibleName(/^Wigor: 95\/100, pełne za 10 min$/);
    const running = page.getByRole('region', { name: 'Trwa' });
    await expect(running).toContainText('Przeszukanie wraku przy falochronie');
    await expect(page.getByTestId('activity-remaining')).toHaveText(
      /pozostało (5 min|4 min|\d+ s)/,
    );
    await expect(page.getByTestId('next-step')).toContainText('Zlecenie trwa');

    // Po 5 minutach czasu serwera nagroda czeka do odbioru.
    await advanceServerClock(page, 5 * MINUTE);
    await page.reload();
    const ready = page.getByRole('region', { name: 'Gotowe do odbioru' });
    await expect(ready).toContainText('+36 PD · +3 srebra');
    await expect(page.getByTestId('next-step')).toContainText('Nagrody czekają');

    await ready.getByRole('button', { name: 'Odbierz' }).click({ force: true });
    await expect(page.getByTestId('wallet-silver')).toHaveText('Srebro: 3');
    // 36 PD przy progu 37 (GDD 1.1): pasek doświadczenia prawie pełny, jeszcze bez awansu.
    await expect(page.getByTestId('character-level')).toHaveText('Poziom 1');
    await expect(page.getByRole('region', { name: 'Twoja postać' })).toContainText('36 / 37 PD');
    await expect(ready).toContainText('Nic nie czeka na odbiór.');

    // Wigor: 95 + 5 po 10 minutach od startu (minęło już 5) → pełny po kolejnych 5.
    await advanceServerClock(page, 5 * MINUTE);
    await page.reload();
    await expect(resource(page, 'vigor')).toHaveAccessibleName('Wigor: 100/100, pełne');

    // Kolejne zlecenie na zrzut ekranu Domu z działającym timerem.
    await page.getByRole('link', { name: 'Miasto' }).click({ force: true });
    await page
      .getByRole('button', { name: 'Rozpocznij: Bursztyn z odpływu' })
      .click({ force: true });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Dom' })).toHaveAttribute('aria-current', 'page');
    await expect(resource(page, 'vigor')).toHaveAccessibleName(/^Wigor: 80\/100/);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expect(page.getByRole('heading', { level: 1, name: 'Dom' })).toBeInViewport();
    await page.evaluate(() => document.fonts.ready);
    const path = testInfo.outputPath(`etap0-dom-${testInfo.project.name}.png`);
    await page.screenshot({ path });
    await testInfo.attach('etap0-dom', { path, contentType: 'image/png' });
  });

  test('dotknięcie paska zasobu pokazuje czas do pełnej regeneracji', async ({ page }) => {
    await registerViaUi(page, newAccount());
    await page.getByRole('link', { name: 'Miasto' }).click({ force: true });
    await page
      .getByRole('button', { name: 'Rozpocznij: Bursztyn z odpływu' })
      .click({ force: true });

    await resource(page, 'vigor').click({ force: true });
    await expect(page.getByRole('status')).toHaveText('Wigor: 80/100, pełne za 40 min');
    await resource(page, 'toil').click({ force: true });
    await expect(page.getByRole('status')).toHaveText('Znój: 50/50, pełne');
  });

  test('tablica blokuje drugie zlecenie, dopóki pierwsze nie zostanie odebrane', async ({
    page,
  }) => {
    await registerViaUi(page, newAccount());
    await page.getByRole('link', { name: 'Miasto' }).click({ force: true });
    await page
      .getByRole('button', { name: 'Rozpocznij: Zbiór morskiej rzęsy' })
      .click({ force: true });
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole('link', { name: 'Miasto' }).click({ force: true });
    await expect(page.getByText('Najpierw odbierz bieżące zlecenie.')).toBeVisible();
    for (const button of await page.getByRole('button', { name: /^Rozpocznij:/ }).all()) {
      await expect(button).toBeDisabled();
    }
  });
});
