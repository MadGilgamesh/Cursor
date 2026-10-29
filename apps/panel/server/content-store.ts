import { randomUUID } from 'node:crypto';

import {
  loadContentPack,
  packDocument,
  pinAction,
  publishDraft,
  removeRecord,
  resolvePinnedAction,
  rollbackPublication,
  saveRecord,
  type ActionKind,
  type CollectionName,
  type ContentPack,
  type PublicationLog,
} from '@game/content';
import { desc, eq } from 'drizzle-orm';
import { ZodError } from 'zod';

import type { PanelDatabase } from './db.js';
import { PanelError } from './errors.js';
import { readDraft } from './prepare.js';
import { auditLog, contentActions, contentPublications, contentState } from './schema.js';

async function loadLog(db: PanelDatabase): Promise<PublicationLog> {
  const rows = await db.select().from(contentPublications).orderBy(contentPublications.revision);
  const [state] = await db.select().from(contentState).limit(1);
  return {
    currentRevision: state?.currentRevision ?? null,
    packs: rows.map((row) => ({
      ...packDocument(loadContentPack(row.document)),
      revision: row.revision,
    })),
  };
}

function actionKind(value: string): ActionKind {
  if (value === 'mission' || value === 'event') return value;
  throw new PanelError(500, 'INTERNAL', 'Akcja ma nieznany rodzaj');
}

function asValidation(error: unknown): never {
  if (error instanceof PanelError || error instanceof ZodError) throw error;
  if (error instanceof Error) throw new PanelError(400, 'VALIDATION', error.message);
  throw error;
}

export async function contentOverview(db: PanelDatabase) {
  const { draft, currentRevision } = await readDraft(db);
  const rows = await db
    .select({
      revision: contentPublications.revision,
      document: contentPublications.document,
      publishedAt: contentPublications.publishedAt,
    })
    .from(contentPublications)
    .orderBy(desc(contentPublications.revision));
  return {
    draft,
    currentRevision,
    publications: rows.map((row) => ({
      revision: row.revision,
      label: row.document.label,
      publishedAt: row.publishedAt.toISOString(),
      current: row.revision === currentRevision,
    })),
  };
}

export async function writeRecord(
  db: PanelDatabase,
  collection: CollectionName,
  record: unknown,
): Promise<ContentPack> {
  const { draft } = await readDraft(db);
  let next: ContentPack;
  try {
    next = saveRecord(draft, collection, record);
  } catch (error) {
    asValidation(error);
  }
  await db.update(contentState).set({ draft: next }).where(eq(contentState.singleton, true));
  return next;
}

export async function deleteRecord(
  db: PanelDatabase,
  collection: CollectionName,
  id: string,
): Promise<ContentPack> {
  const { draft } = await readDraft(db);
  let next: ContentPack;
  try {
    next = removeRecord(draft, collection, id);
  } catch (error) {
    asValidation(error);
  }
  await db.update(contentState).set({ draft: next }).where(eq(contentState.singleton, true));
  return next;
}

export async function publishContent(db: PanelDatabase, staffId: string, staffEmail: string) {
  const { draft } = await readDraft(db);
  const log = await loadLog(db);
  let nextLog: PublicationLog;
  try {
    nextLog = publishDraft(log, draft);
  } catch (error) {
    asValidation(error);
  }
  const published = nextLog.packs[nextLog.packs.length - 1];
  if (!published) throw new Error('Publikacja nie powstała');
  await db.transaction(async (tx) => {
    await tx.insert(contentPublications).values({
      revision: published.revision,
      document: published,
      staffId,
    });
    await tx
      .update(contentState)
      .set({ currentRevision: published.revision, draft: published })
      .where(eq(contentState.singleton, true));
    await tx.insert(auditLog).values({
      actor: 'system',
      action: 'staff.publish',
      after: { revision: published.revision, label: published.label, staffId, staffEmail },
    });
  });
  return { revision: published.revision };
}

export async function rollbackContent(db: PanelDatabase, staffId: string, revision: number) {
  const log = await loadLog(db);
  let nextLog: PublicationLog;
  try {
    nextLog = rollbackPublication(log, revision);
  } catch (error) {
    asValidation(error);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(contentState)
      .set({ currentRevision: nextLog.currentRevision })
      .where(eq(contentState.singleton, true));
    await tx.insert(auditLog).values({
      actor: 'system',
      action: 'staff.rollback',
      before: { revision: log.currentRevision },
      after: { revision: nextLog.currentRevision, staffId },
    });
  });
  return { revision: nextLog.currentRevision };
}

export async function startAction(
  db: PanelDatabase,
  input: { kind: ActionKind; defId: string; characterId?: string | undefined },
) {
  const log = await loadLog(db);
  const id = randomUUID();
  let action: ReturnType<typeof pinAction>;
  try {
    action = pinAction(log, { id, kind: input.kind, defId: input.defId });
  } catch (error) {
    asValidation(error);
  }
  await db.insert(contentActions).values({
    id: action.id,
    kind: action.kind,
    defId: action.defId,
    contentRevision: action.contentRevision,
    characterId: input.characterId ?? null,
  });
  return { ...action, outcome: resolvePinnedAction(log, action) };
}

export async function readAction(db: PanelDatabase, id: string) {
  const [row] = await db.select().from(contentActions).where(eq(contentActions.id, id)).limit(1);
  if (!row) throw new PanelError(404, 'NOT_FOUND', 'Nie ma takiej akcji');
  const log = await loadLog(db);
  const action = {
    id: row.id,
    kind: actionKind(row.kind),
    defId: row.defId,
    contentRevision: row.contentRevision,
  };
  try {
    return { ...action, outcome: resolvePinnedAction(log, action) };
  } catch (error) {
    asValidation(error);
  }
}
