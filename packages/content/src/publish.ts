/**
 * Publikacja dokłada nową rewizję i przestawia wskaźnik.
 * Akcja trzyma rewizję, na której wystartowała — późniejsza publikacja
 * i wycofanie wskaźnika nie zmieniają jej wyniku.
 */
import { loadContentPack, packDocument, type ContentPack } from './pack.js';
import type { EventModifier, Reward } from './schema.js';

function clonePack(pack: ContentPack): ContentPack {
  return JSON.parse(JSON.stringify(pack)) as ContentPack;
}

export interface PublicationLog {
  currentRevision: number | null;
  packs: readonly ContentPack[];
}

export type ActionKind = 'mission' | 'event';

export interface PinnedAction {
  id: string;
  kind: ActionKind;
  defId: string;
  contentRevision: number;
}

export interface ActionOutcome {
  contentRevision: number;
  summary: string;
  rewards: Reward[];
  modifiers: EventModifier[];
}

export function publishDraft(log: PublicationLog, draft: ContentPack): PublicationLog {
  const validated = packDocument(loadContentPack(draft));
  const revision = log.packs.reduce((max, pack) => Math.max(max, pack.revision), 0) + 1;
  const published: ContentPack = clonePack({ ...validated, revision });
  return {
    currentRevision: revision,
    packs: [...log.packs, published],
  };
}

export function rollbackPublication(log: PublicationLog, revision: number): PublicationLog {
  if (!log.packs.some((pack) => pack.revision === revision)) {
    throw new Error(`Nie ma publikacji ${revision}`);
  }
  return { currentRevision: revision, packs: log.packs };
}

export function publishedPack(log: PublicationLog): ContentPack | undefined {
  if (log.currentRevision === null) return undefined;
  return log.packs.find((pack) => pack.revision === log.currentRevision);
}

function outcomeOf(pack: ContentPack, action: PinnedAction): ActionOutcome {
  if (action.kind === 'mission') {
    const mission = pack.collections.missions.find((item) => item.id === action.defId);
    if (!mission) {
      throw new Error(`Brak zlecenia ${action.defId} w rewizji ${pack.revision}`);
    }
    return {
      contentRevision: pack.revision,
      summary: mission.successTexts[0] ?? mission.description,
      rewards: [],
      modifiers: [],
    };
  }
  const event = pack.collections.events.find((item) => item.id === action.defId);
  if (!event) throw new Error(`Brak eventu ${action.defId} w rewizji ${pack.revision}`);
  return {
    contentRevision: pack.revision,
    summary: event.description,
    rewards: event.rewards,
    modifiers: event.modifiers,
  };
}

/** Wynik liczony wyłącznie z paczki o rewizji zapisanej na akcji. */
export function resolvePinnedAction(log: PublicationLog, action: PinnedAction): ActionOutcome {
  const pack = log.packs.find((item) => item.revision === action.contentRevision);
  if (!pack) throw new Error(`Brak paczki o rewizji ${action.contentRevision}`);
  return outcomeOf(pack, action);
}

export function pinAction(
  log: PublicationLog,
  input: { id: string; kind: ActionKind; defId: string },
): PinnedAction {
  if (log.currentRevision === null) throw new Error('Brak opublikowanej wersji');
  const action: PinnedAction = { ...input, contentRevision: log.currentRevision };
  resolvePinnedAction(log, action);
  return action;
}
