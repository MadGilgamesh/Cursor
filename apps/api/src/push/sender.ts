import type { PushPayload } from '@game/shared';
import webpush from 'web-push';

import type { VapidConfig } from '../config.js';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushSendResult = { ok: true } | { ok: false; gone: boolean; status: number | null };

export interface PushSender {
  send(target: PushTarget, payload: PushPayload): Promise<PushSendResult>;
}

const PUSH_TTL_SECONDS = 60 * 60;
const PUSH_TIMEOUT_MS = 10_000;

/**
 * Nadawca Web Push: `web-push` szyfruje treść i podpisuje żądanie kluczem VAPID,
 * a samo wysłanie robimy przez `fetch` (biblioteka obsługuje wyłącznie HTTPS,
 * a testy odbierają powiadomienia na lokalnym serwerze HTTP).
 */
export function createWebPushSender(
  vapid: VapidConfig,
  fetchImpl: typeof fetch = fetch,
): PushSender {
  return {
    async send(target, payload) {
      const details = webpush.generateRequestDetails(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: vapid,
          TTL: PUSH_TTL_SECONDS,
          urgency: 'normal',
          topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
        },
      );
      try {
        const response = await fetchImpl(details.endpoint, {
          method: details.method,
          headers: details.headers as Record<string, string>,
          body: new Uint8Array(details.body),
          signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
        });
        if (response.ok) return { ok: true };
        // 404/410: przeglądarka wycofała subskrypcję — trzeba ją usunąć.
        return {
          ok: false,
          gone: response.status === 404 || response.status === 410,
          status: response.status,
        };
      } catch {
        return { ok: false, gone: false, status: null };
      }
    },
  };
}
