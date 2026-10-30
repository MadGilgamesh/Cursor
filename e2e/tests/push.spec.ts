import { expect, test } from '@playwright/test';

import {
  startPushReceiver,
  type PushReceiver,
} from '../../apps/api/test/integration/push-receiver';
import { clickInView, newAccount, registerViaUi } from './helpers';

let receiver: PushReceiver;

test.beforeAll(async () => {
  receiver = await startPushReceiver();
});

test.afterAll(async () => {
  await receiver.close();
});

test('Web Push: włączenie na urządzeniu → koniec zlecenia → zaszyfrowane powiadomienie', async ({
  page,
}) => {
  // Zgoda na powiadomienia i subskrypcja należą do przeglądarki (serwis push, np. FCM),
  // więc je podmieniamy: subskrypcja wskazuje lokalny odbiornik z prawdziwymi kluczami,
  // dzięki czemu szyfrowanie i podpis VAPID są sprawdzane w całości.
  const subscription = receiver.subscription();
  await page.addInitScript((sub) => {
    if (!('PushManager' in window)) return;
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
    Notification.requestPermission = () => Promise.resolve('granted');
    let current: PushSubscription | null = null;
    const fake = {
      endpoint: sub.endpoint,
      expirationTime: null,
      options: {},
      getKey: () => null,
      toJSON: () => ({ endpoint: sub.endpoint, expirationTime: null, keys: sub.keys }),
      unsubscribe: () => {
        current = null;
        return Promise.resolve(true);
      },
    } as unknown as PushSubscription;
    PushManager.prototype.subscribe = () => {
      current = fake;
      return Promise.resolve(fake);
    };
    PushManager.prototype.getSubscription = () => Promise.resolve(current);
  }, subscription);

  await registerViaUi(page, newAccount());
  await clickInView(page.getByRole('link', { name: 'Postać' }));

  // WebKit w Playwright (Linux) nie ma Push API — aplikacja ma to uczciwie zakomunikować.
  if (!(await page.evaluate(() => 'PushManager' in window))) {
    await expect(page.getByTestId('push-status')).toHaveText(
      'Ta przeglądarka nie obsługuje powiadomień push.',
    );
    return;
  }

  await page.getByRole('button', { name: 'Włącz powiadomienia' }).click();
  await expect(page.getByTestId('push-status')).toHaveText(
    'Powiadomienia są włączone na tym urządzeniu.',
  );

  await clickInView(page.getByRole('link', { name: 'Miasto' }));
  await page
    .getByRole('button', { name: 'Rozpocznij: Przeszukanie wraku przy falochronie' })
    .click();
  await expect(page).toHaveURL(/\/$/);

  const before = receiver.received.length;
  await page.request.post('/api/test/clock/advance', { data: { ms: 5 * 60_000 } });
  const sweep = await page.request.post('/api/test/jobs/activities-sweep');
  // Scheduler rozstrzyga timery wszystkich graczy (także z wcześniejszych testów),
  // ale subskrypcję ma tylko ten gracz — więc na odbiornik trafia dokładnie jego powiadomienie.
  const { notifications } = (await sweep.json()) as { notifications: number };
  expect(notifications).toBeGreaterThanOrEqual(1);

  const [push] = (await receiver.waitFor(before + 1)).slice(before);
  expect(push?.path).toBe(new URL(subscription.endpoint).pathname);
  expect(push?.headers['content-encoding']).toBe('aes128gcm');
  expect(push?.payload).toMatchObject({
    title: 'Zlecenie zakończone',
    body: 'Przeszukanie wraku przy falochronie: nagroda czeka w Domu.',
    url: '/',
  });

  // Wyłączenie usuwa subskrypcję z serwera.
  await clickInView(page.getByRole('link', { name: 'Postać' }));
  await page.getByRole('button', { name: 'Wyłącz powiadomienia' }).click();
  await expect(page.getByRole('button', { name: 'Włącz powiadomienia' })).toBeVisible();
});
