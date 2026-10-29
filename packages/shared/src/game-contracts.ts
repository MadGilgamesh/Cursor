/**
 * Kontrakty stanu gry: zasoby, portfel, aktywności z timerem i Web Push.
 * Serwer nigdy nie wysyła ziarna aktywności ani wyniku przed jej zakończeniem.
 */
import { z } from 'zod';

import { characterSchema } from './contracts.js';

const isoDateTime = z.iso.datetime({ offset: true });

export const resourceSnapshotSchema = z.object({
  /** Wartość w chwili `updatedAt` (czas serwera); dalszą regenerację klient liczy `materializeResource`. */
  value: z.int().min(0),
  max: z.int().positive(),
  updatedAt: isoDateTime,
});
export type ResourceSnapshot = z.infer<typeof resourceSnapshotSchema>;

export const resourcesSchema = z.object({
  life: resourceSnapshotSchema,
  vigor: resourceSnapshotSchema,
  toil: resourceSnapshotSchema,
  sanity: resourceSnapshotSchema,
});
export type Resources = z.infer<typeof resourcesSchema>;

export const walletSchema = z.object({
  silver: z.int().min(0),
});
export type Wallet = z.infer<typeof walletSchema>;

export const ACTIVITY_STATUSES = ['active', 'completed', 'claimed'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const activityResultSchema = z.object({
  experience: z.int().min(0),
  silver: z.int().min(0),
  outcome: z.string(),
});

export const activitySchema = z.object({
  id: z.uuid(),
  type: z.literal('mission'),
  defId: z.string(),
  status: z.enum(ACTIVITY_STATUSES),
  startAt: isoDateTime,
  endAt: isoDateTime,
  /** Wynik — tylko dla zakończonych aktywności. */
  result: activityResultSchema.nullable(),
});
export type Activity = z.infer<typeof activitySchema>;

/** Pulpit Dom: wszystko, czego potrzebuje ekran główny, w jednym żądaniu. */
export const dashboardResponseSchema = z.object({
  serverTime: isoDateTime,
  character: characterSchema,
  resources: resourcesSchema,
  wallet: walletSchema,
  /** Aktywne i zakończone, jeszcze nieodebrane aktywności. */
  activities: z.array(activitySchema),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

export const startMissionRequestSchema = z.object({
  missionId: z.string().min(1).max(100),
});
export type StartMissionRequest = z.infer<typeof startMissionRequestSchema>;

export const startActivityResponseSchema = z.object({
  activity: activitySchema,
  resources: resourcesSchema,
});
export type StartActivityResponse = z.infer<typeof startActivityResponseSchema>;

export const claimResponseSchema = z.object({
  claimed: z.array(activitySchema),
  character: characterSchema,
  wallet: walletSchema,
  resources: resourcesSchema,
});
export type ClaimResponse = z.infer<typeof claimResponseSchema>;

export const pushConfigResponseSchema = z.object({
  enabled: z.boolean(),
  publicKey: z.string().nullable(),
});
export type PushConfigResponse = z.infer<typeof pushConfigResponseSchema>;

export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https?$/ }).max(2_048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.url().max(2_048),
});

/** Treść powiadomienia przekazywana do service workera. */
export const pushPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  url: z.string(),
  tag: z.string(),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;
