/**
 * Dane statyczne: Dzienne zadanie i Kalendarz Pamięci (GDD 5.24). Etap 1 zawiera
 * tylko aktywności, które już istnieją; Klucz Snu z odbioru zadania, Świece,
 * Odłamki, Kwity, Echa i Sigile w kamieniach milowych dochodzą z ich systemami.
 */
export const DAILY_TASK_KINDS = [
  'huntWin',
  'namedWin',
  'huntRefresh',
  'missionStart',
  'missionSuccess',
  'trainingVigor',
  'shopBuy',
  'itemSell',
  'bankDeposit',
  'consumableUse',
] as const;
export type DailyTaskKind = (typeof DAILY_TASK_KINDS)[number];

export interface DailyTaskDef {
  kind: DailyTaskKind;
  target: number;
}

/** Pula 10 aktywności; serwer losuje z niej 6 na dobę (GDD 5.24). */
export const DAILY_TASKS: readonly DailyTaskDef[] = [
  { kind: 'huntWin', target: 3 },
  { kind: 'namedWin', target: 1 },
  { kind: 'huntRefresh', target: 1 },
  { kind: 'missionStart', target: 1 },
  { kind: 'missionSuccess', target: 2 },
  { kind: 'trainingVigor', target: 30 },
  { kind: 'shopBuy', target: 1 },
  { kind: 'itemSell', target: 3 },
  { kind: 'bankDeposit', target: 1 },
  { kind: 'consumableUse', target: 1 },
];

export interface CalendarMilestone {
  day: number;
  silver: number;
  items: readonly { itemId: string; quantity: number }[];
}

/** Kamienie milowe Kalendarza Pamięci — nagrody z systemów Etapu 1 (założenie). */
export const CALENDAR_MILESTONE_REWARDS: readonly CalendarMilestone[] = [
  { day: 7, silver: 300, items: [{ itemId: 'consumable.potion', quantity: 2 }] },
  { day: 14, silver: 600, items: [{ itemId: 'consumable.coffee', quantity: 2 }] },
  {
    day: 21,
    silver: 1_000,
    items: [
      { itemId: 'consumable.potion', quantity: 2 },
      { itemId: 'consumable.laudanum', quantity: 1 },
    ],
  },
  { day: 28, silver: 2_000, items: [{ itemId: 'consumable.coffee', quantity: 3 }] },
];
