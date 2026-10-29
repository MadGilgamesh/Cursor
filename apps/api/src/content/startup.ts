/**
 * Potok treści jest obok gry: przy starcie sprawdzamy paczkę z danych statycznych
 * i — jeśli Kancelaria coś opublikowała — także bieżącą rewizję w bazie.
 * Błędna paczka zatrzymuje serwer, tak jak dotychczasowe `validateStaticData`.
 */
import { assertBaselineContent, loadContentPack, panelSchemaStatements } from '@game/content';
import { sql } from 'drizzle-orm';

import type { Database } from '../db/client.js';

export function assertStartupContent(): void {
  assertBaselineContent();
}

export async function ensurePanelSchema(db: Database): Promise<void> {
  for (const statement of panelSchemaStatements()) {
    await db.execute(sql.raw(statement));
  }
}

export async function assertPublishedContent(db: Database): Promise<void> {
  const rows = await db.execute<{ document: unknown }>(sql`
    select p.document as document
    from content_state s
    join content_publications p on p.revision = s.current_revision
    where s.singleton = true and s.current_revision is not null
  `);
  for (const row of rows) {
    loadContentPack(row.document);
  }
}
