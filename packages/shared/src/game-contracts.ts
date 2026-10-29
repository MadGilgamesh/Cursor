/**
 * Kontrakty stanu gry: zasoby, portfel, aktywności z timerem i Web Push.
 * Serwer nigdy nie wysyła ziarna aktywności ani wyniku przed jej zakończeniem.
 */
import { z } from 'zod';

import { characterSchema } from './contracts.js';
import { CITIES } from './world.js';

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
  success: z.boolean(),
  lifeLoss: z.int().min(0),
  sanityLoss: z.int().min(0),
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

/** Skrót Portalu na pulpicie Dom (GDD 11, DoD 5). */
export const portalHomeSchema = z.object({
  regenKeys: z.int().min(0),
  lootKeys: z.int().min(0),
  shards: z.int().min(0),
  totalKeys: z.int().min(0),
  nextDomain: z.int().min(1),
  nextStage: z.int().min(1),
  nextSubstage: z.int().min(1),
  nextName: z.string(),
  wellFloor: z.int().min(0),
  candles: z.int().min(0),
});

/** Skrót Wiedzy, Spraw i Sigili na pulpicie Dom (GDD 11, DoD 5). */
export const loreHomeSchema = z.object({
  knowledge: z.int().min(0).max(80),
  scars: z.array(z.string()),
  madnessUi: z.boolean(),
  sanityTier: z.enum(['calm', 'uneasy', 'shaken', 'edge', 'broken']),
  caseOpen: z.boolean(),
  residents: z.int().min(0),
  reforgeLeft: z.int().min(0),
  colourSigils: z.int().min(0),
  collegeEndsAt: z.iso.datetime({ offset: true }).nullable(),
  readingEndsAt: z.iso.datetime({ offset: true }).nullable(),
  composure: z.int().min(0),
  insight: z.int().min(0),
  stealth: z.int().min(0),
});
export type LoreHome = z.infer<typeof loreHomeSchema>;

/** Skrót drogi na pulpicie Dom (GDD 5.16). */
export const worldHomeSchema = z.object({
  city: z.enum(CITIES),
  cityName: z.string(),
  traveling: z.boolean(),
  travelTo: z.string().nullable(),
  weather: z.string(),
  wolfHour: z.boolean(),
  tide: z.enum(['low', 'high']),
  thirsty: z.int().min(0),
});
export type WorldHome = z.infer<typeof worldHomeSchema>;
export type PortalHome = z.infer<typeof portalHomeSchema>;

/** Pulpit Dom: wszystko, czego potrzebuje ekran główny, w jednym żądaniu. */
export const dashboardResponseSchema = z.object({
  serverTime: isoDateTime,
  character: characterSchema,
  resources: resourcesSchema,
  wallet: walletSchema,
  /** Aktywne i zakończone, jeszcze nieodebrane aktywności. */
  activities: z.array(activitySchema),
  portal: portalHomeSchema,
  lore: loreHomeSchema,
  world: worldHomeSchema,
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

export const startMissionRequestSchema = z.object({
  missionId: z.string().min(1).max(100),
  /** Kontynuacja pętli (do 11). Bez tego pola zlecenie startuje od nowa. */
  loop: z.boolean().default(false),
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
