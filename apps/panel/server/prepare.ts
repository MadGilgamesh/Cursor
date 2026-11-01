import {
  buildBaselinePack,
  loadContentPack,
  packDocument,
  publishDraft,
  type ContentPack,
} from '@game/content';
import { desc, eq } from 'drizzle-orm';

import type { StaffBootstrap } from './config.js';
import type { PanelDatabase } from './db.js';
import { hashPassword } from './password.js';
import { contentPublications, contentState, staffAccounts } from './schema.js';

/** Pierwsza publikacja to dane statyczne gry. Kolejny start niczego nie nadpisuje. */
export async function seedBaseline(db: PanelDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ revision: contentPublications.revision })
      .from(contentPublications)
      .limit(1);
    const [state] = await tx.select().from(contentState).limit(1);
    if (existing) {
      if (!state) {
        const [latest] = await tx
          .select()
          .from(contentPublications)
          .orderBy(desc(contentPublications.revision));
        const document = latest ? loadContentPack(latest.document) : undefined;
        if (!latest || !document) throw new Error('Publikacja bez dokumentu');
        await tx.insert(contentState).values({
          singleton: true,
          currentRevision: latest.revision,
          draft: packDocument(document),
        });
      }
      return;
    }
    const baseline = buildBaselinePack();
    const log = publishDraft(
      { currentRevision: null, packs: [] },
      {
        ...baseline,
        label: 'Dane statyczne — publikacja początkowa',
      },
    );
    const published = log.packs[0];
    if (!published) throw new Error('Nie udało się złożyć publikacji początkowej');
    await tx.insert(contentPublications).values({
      revision: published.revision,
      document: published,
    });
    if (state) {
      await tx
        .update(contentState)
        .set({ currentRevision: published.revision, draft: published })
        .where(eq(contentState.singleton, true));
    } else {
      await tx.insert(contentState).values({
        singleton: true,
        currentRevision: published.revision,
        draft: published,
      });
    }
  });
}

export async function bootstrapStaff(db: PanelDatabase, bootstrap: StaffBootstrap): Promise<void> {
  const [existing] = await db
    .select({ id: staffAccounts.id })
    .from(staffAccounts)
    .where(eq(staffAccounts.email, bootstrap.email))
    .limit(1);
  if (existing) return;
  await db.insert(staffAccounts).values({
    email: bootstrap.email,
    passwordHash: await hashPassword(bootstrap.password),
    role: bootstrap.role,
  });
}

export async function readDraft(db: PanelDatabase): Promise<{
  draft: ContentPack;
  currentRevision: number | null;
}> {
  const [state] = await db.select().from(contentState).limit(1);
  if (!state?.draft || state.currentRevision === null) {
    throw new Error('Brak szkicu treści. Uruchom seed paczki bazowej.');
  }
  return {
    draft: packDocument(loadContentPack(state.draft)),
    currentRevision: state.currentRevision,
  };
}
