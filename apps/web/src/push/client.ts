import {
  API_PREFIX,
  pushConfigResponseSchema,
  pushSubscriptionSchema,
  type PushSubscriptionInput,
} from '@game/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../api/client';

export type PushState = 'unsupported' | 'server-disabled' | 'denied' | 'off' | 'on';

const pushStateKey = ['push-state'] as const;

export const isPushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** Klucz VAPID (base64url) → bajty dla `pushManager.subscribe`. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function fetchConfig() {
  return apiRequest(`${API_PREFIX}/push/config`, { schema: pushConfigResponseSchema });
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export function usePushState() {
  return useQuery({
    queryKey: pushStateKey,
    queryFn: async (): Promise<{ state: PushState; publicKey: string | null }> => {
      if (!isPushSupported()) return { state: 'unsupported', publicKey: null };
      const config = await fetchConfig();
      if (!config.enabled || !config.publicKey)
        return { state: 'server-disabled', publicKey: null };
      if (Notification.permission === 'denied')
        return { state: 'denied', publicKey: config.publicKey };
      const subscription = await currentSubscription();
      return { state: subscription ? 'on' : 'off', publicKey: config.publicKey };
    },
  });
}

export function useTogglePush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ enable, publicKey }: { enable: boolean; publicKey: string }) => {
      if (enable) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        const registration = await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(publicKey),
          }));
        const body: PushSubscriptionInput = pushSubscriptionSchema.parse(subscription.toJSON());
        await apiRequest(`${API_PREFIX}/push/subscriptions`, { method: 'POST', body });
      } else {
        const subscription = await currentSubscription();
        if (!subscription) return;
        await apiRequest(`${API_PREFIX}/push/subscriptions`, {
          method: 'DELETE',
          body: { endpoint: subscription.endpoint },
        });
        await subscription.unsubscribe();
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pushStateKey }),
  });
}
