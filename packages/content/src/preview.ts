/**
 * Podgląd eventu przed publikacją. Nie zapisuje paczki i nie rusza wskaźnika rewizji.
 */
import type { GameEvent } from './schema.js';

export type EventPhase = 'wylaczony' | 'przed' | 'trwa' | 'po';

export interface EventPreview {
  phase: EventPhase;
  timezone: 'UTC';
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  rewards: GameEvent['rewards'];
  modifiers: GameEvent['modifiers'];
  missions: GameEvent['missions'];
  battles: GameEvent['battles'];
  lore: GameEvent['lore'];
  tasks: GameEvent['tasks'];
}

const PHASE_LABELS: Record<EventPhase, string> = {
  wylaczony: 'Wyłączony',
  przed: 'Przed startem',
  trwa: 'Trwa',
  po: 'Zakończony',
};

export function eventPhaseLabel(phase: EventPhase): string {
  return PHASE_LABELS[phase];
}

export function previewEvent(event: GameEvent, at: Date): EventPreview {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  const now = at.getTime();
  let phase: EventPhase;
  if (!event.enabled) phase = 'wylaczony';
  else if (now < start) phase = 'przed';
  else if (now >= end) phase = 'po';
  else phase = 'trwa';
  return {
    phase,
    timezone: 'UTC',
    name: event.name,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    rewards: event.rewards,
    modifiers: event.modifiers,
    missions: event.missions,
    battles: event.battles,
    lore: event.lore,
    tasks: event.tasks,
  };
}
