/**
 * Paczka bazowa składa się z danych statycznych gry (bestiariusz, przedmioty,
 * zlecenia) oraz lokacji i tekstów, które już w nich występują.
 * Serwer woła `assertBaselineContent` przy starcie i nie wstaje, gdy paczka jest zła.
 */
import { ENEMIES, ITEMS, MISSIONS, STATIC_DATA_VERSION, TUTORIAL_ENEMY } from '@game/shared';

import { LOCATIONS } from './locations.js';
import { CURRENT_FORMAT, PACK_ID } from './migrate.js';
import { loadContentPack, packDocument, type ContentPack } from './pack.js';
import { TEXTS } from './texts.js';

export function buildBaselinePack(): ContentPack {
  return packDocument(
    loadContentPack({
      format: CURRENT_FORMAT,
      id: PACK_ID,
      revision: 0,
      label: `Dane statyczne (wersja ${STATIC_DATA_VERSION})`,
      collections: {
        bestiary: [...ENEMIES, TUTORIAL_ENEMY],
        items: ITEMS,
        missions: MISSIONS,
        locations: LOCATIONS,
        texts: TEXTS,
        events: [],
      },
    }),
  );
}

export function assertBaselineContent(): ContentPack {
  const pack = buildBaselinePack();
  const missionIds = new Set(pack.collections.missions.map((mission) => mission.id));
  for (const mission of MISSIONS) {
    if (!missionIds.has(mission.id)) {
      throw new Error(`Paczka bazowa gubi zlecenie ${mission.id}`);
    }
  }
  const enemyIds = new Set(pack.collections.bestiary.map((enemy) => enemy.id));
  for (const enemy of ENEMIES) {
    if (!enemyIds.has(enemy.id)) throw new Error(`Paczka bazowa gubi wroga ${enemy.id}`);
  }
  if (!enemyIds.has(TUTORIAL_ENEMY.id)) {
    throw new Error(`Paczka bazowa gubi wroga ${TUTORIAL_ENEMY.id}`);
  }
  const itemIds = new Set(pack.collections.items.map((item) => item.id));
  for (const item of ITEMS) {
    if (!itemIds.has(item.id)) throw new Error(`Paczka bazowa gubi przedmiot ${item.id}`);
  }
  return pack;
}
