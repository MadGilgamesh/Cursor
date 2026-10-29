import { z } from 'zod';

import { MISSION_TIERS } from '../balance.js';
import { MISSIONS, type MissionDef } from './missions.js';

export * from './missions.js';

/** Wersja danych statycznych — rośnie przy każdej zmianie plików w `data/`. */
export const STATIC_DATA_VERSION = 1;

/** Waluty obecne w grze (GDD 4.2). Kolejne (Kwity, Pieczęcie…) dochodzą z systemami, które ich używają. */
export const CURRENCIES = ['silver'] as const;
export type Currency = (typeof CURRENCIES)[number];

const tierIds = MISSION_TIERS.map((tier) => tier.id) as [string, ...string[]];

const missionDefSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, 'Identyfikator w formacie „grupa.nazwa”'),
  name: z.string().min(1),
  description: z.string().min(1),
  tierId: z.enum(tierIds),
  outcomes: z.array(z.object({ weight: z.int().positive(), text: z.string().min(1) })).min(1),
});

/** Sprawdza spójność danych statycznych; serwer wywołuje to przy starcie i odmawia uruchomienia przy błędzie. */
export function validateStaticData(missions: readonly MissionDef[] = MISSIONS): void {
  z.array(missionDefSchema).parse(missions);
  const seen = new Set<string>();
  for (const mission of missions) {
    if (seen.has(mission.id)) throw new Error(`Zduplikowany identyfikator zlecenia: ${mission.id}`);
    seen.add(mission.id);
  }
}

export function findMission(id: string): MissionDef | undefined {
  return MISSIONS.find((mission) => mission.id === id);
}
