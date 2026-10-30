import { createECDH, randomBytes } from 'node:crypto';

import webpush from 'web-push';
import { describe, expect, it, vi } from 'vitest';

import { OffsetClock } from '../../src/clock.js';
import { createWebPushSender } from '../../src/push/sender.js';

function target() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: 'https://push.example.test/abc',
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
}

const vapid = { ...webpush.generateVAPIDKeys(), subject: 'mailto:test@sol.test' };
const payload = { title: 'T', body: 'B', url: '/', tag: 'activity-1' };

describe('createWebPushSender', () => {
  it('wysyła zaszyfrowane żądanie podpisane VAPID', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    const result = await createWebPushSender(vapid, fetchMock).send(target(), payload);
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://push.example.test/abc');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: 3600 });
    expect((init?.headers as Record<string, string>).Authorization).toMatch(/^vapid t=/);
  });

  it('rozpoznaje wygasłą subskrypcję (404/410) i błędy sieci', async () => {
    const gone = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 410 }));
    expect(await createWebPushSender(vapid, gone).send(target(), payload)).toEqual({
      ok: false,
      gone: true,
      status: 410,
    });
    const throttled = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }));
    expect(await createWebPushSender(vapid, throttled).send(target(), payload)).toMatchObject({
      ok: false,
      gone: false,
    });
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    expect(await createWebPushSender(vapid, offline).send(target(), payload)).toEqual({
      ok: false,
      gone: false,
      status: null,
    });
  });
});

describe('OffsetClock', () => {
  it('przesuwa czas systemowy tylko naprzód', () => {
    const clock = new OffsetClock();
    const before = clock.now().getTime();
    clock.advance(60_000);
    expect(clock.now().getTime() - before).toBeGreaterThanOrEqual(60_000);
    expect(() => {
      clock.advance(-1);
    }).toThrow(RangeError);
  });
});
