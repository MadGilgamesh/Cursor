import { expect, test } from '@playwright/test';

import { newAccount, registerViaUi } from './helpers';

test('Etap 1: poziom 5, klasa Rzeźnik i zlecenie w pętli', async ({ page }) => {
  test.setTimeout(90_000);
  await registerViaUi(page, newAccount());
  await page.getByRole('link', { name: 'Mrok' }).click({ force: true });
  await page.getByRole('button', { name: 'Wstań ze stołu' }).click({ force: true });
  await expect(page.getByTestId('fight-result')).toContainText('Zwycięstwo');
  const trained = page.waitForResponse(
    (response) => response.url().includes('/training') && (response.request().postData() ?? '').includes('evasion'),
  );
  await page.getByRole('button', { name: 'Trenuj ciało (80 Wigoru)' }).click({ force: true });
  await trained;

  for (let i = 0; i < 30; i++) {
    const level = await page.getByTestId('character-level').textContent();
    if (level && Number(level.replace(/\D/g, '')) >= 5) break;
    const fought = page.waitForResponse((response) => response.url().includes('/hunts/fight'), { timeout: 8_000 });
    await page.getByRole('button', { name: 'Walcz' }).first().click({ force: true });
    const response = await fought.catch(() => null);
    if (!response || response.status() === 409) {
      await page.request.post('/api/test/clock/advance', { data: { ms: 60 * 60_000 } });
      await page.reload();
      await page.getByRole('link', { name: 'Mrok' }).click({ force: true });
    }
  }
  await expect(page.getByTestId('character-level')).toContainText(/Poziom [5-9]|Poziom \d{2}/);

  // Zakup i założenie zestawu (ta sama sesja, ciasteczko httpOnly).
  for (const slot of ['head', 'torso', 'legs', 'hands']) {
    const bought = await page.request.post('/api/v1/shop/buy', {
      data: { itemId: `gear.butcher.${slot}.1` },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(bought.ok(), await bought.text()).toBe(true);
  }
  const after = await page.request.get('/api/v1/inventory');
  const bag = (await after.json()) as {
    items: { id: string; defId: string; equippedSlot: string | null }[];
  };
  for (const item of bag.items) {
    if (item.defId.startsWith('gear.') && !item.equippedSlot) {
      const equipped = await page.request.post('/api/v1/inventory/equip', {
        data: { itemId: item.id },
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      expect(equipped.ok(), await equipped.text()).toBe(true);
    }
  }
  await page.getByRole('link', { name: 'Postać' }).click({ force: true });
  await expect(page.getByTestId('active-class')).toContainText('butcher');

  await page.request.post('/api/test/clock/advance', { data: { ms: 3 * 60 * 60_000 } });
  const started = await page.request.post('/api/v1/activities', {
    data: { missionId: 'order.quay-patrol', loop: true },
    headers: { 'idempotency-key': crypto.randomUUID() },
  });
  expect(started.ok(), await started.text()).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Trwa' })).toContainText('Patrol nabrzeża');
});
