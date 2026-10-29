/**
 * Schematy rekordów treści. Nowy wpis to dane zgodne ze schematem, nie zmiana kodu.
 * Nieznane pola są ignorowane (Zod odrzuca je przy odczycie, nie wywala paczki).
 */
import {
  CONSUMABLE_EFFECTS,
  CURRENCIES,
  EQUIPMENT_SLOTS,
  MISSION_KINDS,
  MISSION_TIERS,
  SET_CLASS_IDS,
} from '@game/shared';
import { z } from 'zod';

/** Identyfikator w formacie „grupa.nazwa”, jak w danych statycznych gry. */
export const idSchema = z
  .string()
  .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, 'Identyfikator w formacie „grupa.nazwa”');

const tierIds = MISSION_TIERS.map((tier) => tier.id) as [string, ...string[]];

export const bestiarySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  circle: z.int().min(0).max(9),
  named: z.boolean(),
  dread: z.int().min(0).max(10),
  gaze: z.boolean(),
});
export type BestiaryRecord = z.infer<typeof bestiarySchema>;

const bonusSchema = z.object({
  strength: z.int().nonnegative().optional(),
  defense: z.int().nonnegative().optional(),
  accuracy: z.int().nonnegative().optional(),
  evasion: z.int().nonnegative().optional(),
});

const gearSchema = z.object({
  id: idSchema,
  kind: z.literal('gear'),
  name: z.string().min(1),
  slot: z.enum(EQUIPMENT_SLOTS),
  tier: z.int().min(1).max(20),
  classId: z.enum(SET_CLASS_IDS).nullable(),
  baseBonusBp: bonusSchema,
  baseLife: z.int().nonnegative(),
});

const consumableSchema = z.object({
  id: idSchema,
  kind: z.literal('consumable'),
  name: z.string().min(1),
  description: z.string().min(1),
  effect: z.enum(CONSUMABLE_EFFECTS),
  value: z.int().nonnegative(),
  sold: z.boolean(),
});

const junkSchema = z.object({
  id: idSchema,
  kind: z.literal('junk'),
  name: z.string().min(1),
  description: z.string().min(1),
  value: z.int().nonnegative(),
  circle: z.int().min(0).max(9),
});

export const itemSchema = z.discriminatedUnion('kind', [gearSchema, consumableSchema, junkSchema]);
export type ItemRecord = z.infer<typeof itemSchema>;

export const missionSchema = z.object({
  id: idSchema,
  kind: z.enum(MISSION_KINDS),
  name: z.string().min(1),
  description: z.string().min(1),
  tierId: z.enum(tierIds),
  successTexts: z.array(z.string().min(1)).min(1),
  failureTexts: z.array(z.string().min(1)).min(1),
});
export type MissionRecord = z.infer<typeof missionSchema>;

export const locationSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  district: z.string().min(1),
});
export type LocationRecord = z.infer<typeof locationSchema>;

export const textSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  body: z.string().min(1),
});
export type TextRecord = z.infer<typeof textSchema>;

const utcInstant = z.iso
  .datetime({ offset: true })
  .refine(
    (value) => value.endsWith('Z') || value.endsWith('+00:00'),
    'Harmonogram eventu zapisujemy w strefie UTC',
  );

export const rewardSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('currency'),
    currency: z.enum(CURRENCIES),
    amount: z.int().positive(),
  }),
  z.object({
    kind: z.literal('item'),
    itemId: idSchema,
    quantity: z.int().positive(),
  }),
]);
export type Reward = z.infer<typeof rewardSchema>;

export const modifierSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+([.-][a-z0-9]+)*$/, 'Identyfikator modyfikatora'),
  target: z.string().min(1),
  operation: z.enum(['add', 'multiply']),
  value: z.number(),
});
export type EventModifier = z.infer<typeof modifierSchema>;

/** Czynności, za które zadanie eventu może dać nagrodę. */
export const EVENT_ACTIVITY_KINDS = [
  'huntWin',
  'missionSuccess',
  'training',
  'eventMission',
  'eventBattle',
  'eventLore',
] as const;
export type EventActivityKind = (typeof EVENT_ACTIVITY_KINDS)[number];

export const EVENT_ACTIVITY_LABELS: Record<EventActivityKind, string> = {
  huntWin: 'Wygrana na Łowach',
  missionSuccess: 'Udane zlecenie',
  training: 'Trening',
  eventMission: 'Misja eventu',
  eventBattle: 'Walka eventu',
  eventLore: 'Przeczytanie historii',
};

const eventPieceRewards = z.array(rewardSchema).default([]);

export const eventMissionSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  successTexts: z.array(z.string().min(1)).min(1),
  failureTexts: z.array(z.string().min(1)).min(1),
  rewards: eventPieceRewards,
});
export type EventMission = z.infer<typeof eventMissionSchema>;

export const eventBattleSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  foe: z.string().min(1),
  rewards: eventPieceRewards,
});
export type EventBattle = z.infer<typeof eventBattleSchema>;

export const eventLoreSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  body: z.string().min(1),
});
export type EventLore = z.infer<typeof eventLoreSchema>;

const eventActivityNeedsSubject = (activity: EventActivityKind) => activity.startsWith('event');

export const eventTaskSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    activity: z.enum(EVENT_ACTIVITY_KINDS),
    /** Misja, walka albo historia tego eventu, gdy czynność jest eventowa. */
    subjectId: idSchema.optional(),
    count: z.int().positive(),
    rewards: z.array(rewardSchema).min(1, 'Zadanie musi mieć nagrodę'),
  })
  .refine((task) => !eventActivityNeedsSubject(task.activity) || task.subjectId !== undefined, {
    message: 'Zadanie eventowe musi wskazać misję, walkę albo historię',
    path: ['subjectId'],
  });
export type EventTask = z.infer<typeof eventTaskSchema>;

export const eventSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    startsAt: utcInstant,
    endsAt: utcInstant,
    timezone: z.literal('UTC'),
    enabled: z.boolean(),
    rewards: z.array(rewardSchema),
    modifiers: z.array(modifierSchema),
    /** Puste, gdy paczka powstała zanim doszły te działy. */
    missions: z.array(eventMissionSchema).default([]),
    battles: z.array(eventBattleSchema).default([]),
    lore: z.array(eventLoreSchema).default([]),
    tasks: z.array(eventTaskSchema).default([]),
  })
  .refine((event) => Date.parse(event.endsAt) > Date.parse(event.startsAt), {
    message: 'Koniec musi być później niż start',
    path: ['endsAt'],
  });
export type GameEvent = z.infer<typeof eventSchema>;

export const COLLECTION_NAMES = [
  'bestiary',
  'items',
  'missions',
  'locations',
  'texts',
  'events',
] as const;
export type CollectionName = (typeof COLLECTION_NAMES)[number];

export const collectionSchemas = {
  bestiary: z.array(bestiarySchema),
  items: z.array(itemSchema),
  missions: z.array(missionSchema),
  locations: z.array(locationSchema),
  texts: z.array(textSchema),
  events: z.array(eventSchema),
} as const;

export interface ContentCollections {
  bestiary: BestiaryRecord[];
  items: ItemRecord[];
  missions: MissionRecord[];
  locations: LocationRecord[];
  texts: TextRecord[];
  events: GameEvent[];
}

export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
