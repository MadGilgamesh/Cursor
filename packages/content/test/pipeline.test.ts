import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { assertBaselineContent } from '../src/baseline.js';
import { assertCollectionsPreserved } from '../src/migrate.js';
import { loadContentPack, packDocument, upsertRecord, type ContentPack } from '../src/pack.js';
import { previewEvent } from '../src/preview.js';
import {
  pinAction,
  publishDraft,
  resolvePinnedAction,
  rollbackPublication,
  type PublicationLog,
} from '../src/publish.js';

/** Paczka z czasu, zanim doszły lokacje i eventy. Ma też pola, których schemat nie zna. */
const oldPack = {
  format: 1,
  id: 'zapomniany-brzeg',
  revision: 1,
  label: 'Paczka sprzed lokacji i eventów',
  author: 'kustosz',
  collections: {
    bestiary: [
      {
        id: 'enemy.canal-rat',
        name: 'Szczur z Kanału',
        description: 'Wielki jak pies.',
        circle: 9,
        named: false,
        dread: 0,
        gaze: false,
        futureNote: 'pole z przyszłego schematu',
      },
    ],
    items: [],
    missions: [
      {
        id: 'order.quay-patrol',
        kind: 'order',
        name: 'Patrol nabrzeża',
        description: 'Stary opis.',
        tierId: 'm5',
        successTexts: ['Raport złożony.'],
        failureTexts: ['Mgła.'],
        unused: true,
      },
    ],
    texts: [{ id: 'text.sol.awakening', title: 'Przebudzenie', body: 'Morze szepcze.' }],
    kronika: [{ id: 'text.stara', note: 'kolekcja z przyszłości' }],
  },
};

function minimalPack(success: string, silver: number): ContentPack {
  return packDocument(
    loadContentPack({
      format: 3,
      id: 'zapomniany-brzeg',
      revision: 0,
      label: 'Szkic testowy',
      collections: {
        bestiary: [],
        items: [],
        missions: [
          {
            id: 'order.quay-patrol',
            kind: 'order',
            name: 'Patrol nabrzeża',
            description: 'Opis',
            tierId: 'm5',
            successTexts: [success],
            failureTexts: ['Porażka.'],
          },
        ],
        locations: [],
        texts: [],
        events: [
          {
            id: 'event.noc',
            name: 'Noc Zmarłych',
            description: 'Morze obchodzi ją bez nas.',
            startsAt: '2027-01-01T00:00:00.000Z',
            endsAt: '2027-01-02T00:00:00.000Z',
            timezone: 'UTC',
            enabled: true,
            rewards: [{ kind: 'currency', currency: 'silver', amount: silver }],
            modifiers: [{ id: 'groza', target: 'Groza', operation: 'add', value: 1 }],
          },
        ],
      },
    }),
  );
}

describe('stara paczka po rozszerzeniu schematu', () => {
  it('ładuje się, ignoruje nieznane pola i dostaje puste nowe kolekcje', () => {
    const loaded = loadContentPack(oldPack);
    expect(loaded.format).toBe(3);
    expect(loaded).not.toHaveProperty('author');
    expect(loaded.collections).not.toHaveProperty('kronika');
    expect(loaded.collections.locations).toEqual([]);
    expect(loaded.collections.events).toEqual([]);
    expect(loaded.collections.missions[0]).toMatchObject({
      id: 'order.quay-patrol',
      description: 'Stary opis.',
      successTexts: ['Raport złożony.'],
    });
    expect(loaded.collections.missions[0]).not.toHaveProperty('unused');
    expect(loaded.collections.bestiary[0]).not.toHaveProperty('futureNote');
    expect(loaded.collections.texts[0]?.body).toBe('Morze szepcze.');
  });

  it('po dodaniu kolejnego typu treści stara paczka nadal przechodzi', () => {
    const loaded = loadContentPack(oldPack, {
      toFormat: 4,
      migrations: [{ from: 3, to: 4, addCollections: ['relics'] }],
      collections: {
        relics: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),
      },
    });
    expect(loaded.format).toBe(4);
    expect(loaded.extras.relics).toEqual([]);
    expect(loaded.collections.locations).toEqual([]);
    expect(loaded.collections.missions[0]?.name).toBe('Patrol nabrzeża');
    expect(loaded.collections.bestiary).toHaveLength(1);
  });

  it('odrzuca migrację, która usuwa albo zmienia istniejące rekordy', () => {
    expect(() => {
      assertCollectionsPreserved({ missions: [{ id: 'order.quay-patrol' }] }, { missions: [] });
    }).toThrow(/skróciła/);
    expect(() => {
      assertCollectionsPreserved(
        { missions: [{ id: 'order.quay-patrol', name: 'Patrol' }] },
        { missions: [{ id: 'order.quay-patrol', name: 'Inny' }] },
      );
    }).toThrow(/zmieniła/);
    expect(() => {
      assertCollectionsPreserved({ missions: [{ id: 'a' }] }, {});
    }).toThrow(/usunęła/);
  });
});

describe('publikacja nie zmienia trwającej akcji', () => {
  it('trzyma rewizję startu przy nowej publikacji i po wycofaniu', () => {
    const draft = minimalPack('Raport złożony.', 10);
    let log: PublicationLog = publishDraft({ currentRevision: null, packs: [] }, draft);
    const missionAction = pinAction(log, {
      id: 'akcja-zlecenie',
      kind: 'mission',
      defId: 'order.quay-patrol',
    });
    const eventAction = pinAction(log, {
      id: 'akcja-event',
      kind: 'event',
      defId: 'event.noc',
    });
    const missionBefore = resolvePinnedAction(log, missionAction);
    const eventBefore = resolvePinnedAction(log, eventAction);
    expect(missionBefore.summary).toBe('Raport złożony.');
    expect(eventBefore.rewards).toEqual([{ kind: 'currency', currency: 'silver', amount: 10 }]);

    const mission = draft.collections.missions[0];
    const event = draft.collections.events[0];
    if (!mission || !event) throw new Error('Brak rekordów szkicu');
    const next = upsertRecord(
      upsertRecord(draft, 'missions', { ...mission, successTexts: ['Inny raport.'] }),
      'events',
      { ...event, rewards: [{ kind: 'currency', currency: 'silver', amount: 99 }] },
    );
    log = publishDraft(log, next);
    const startedOnSecond = pinAction(log, {
      id: 'akcja-druga',
      kind: 'event',
      defId: 'event.noc',
    });

    expect(resolvePinnedAction(log, missionAction)).toEqual(missionBefore);
    expect(resolvePinnedAction(log, eventAction)).toEqual(eventBefore);
    expect(resolvePinnedAction(log, startedOnSecond).rewards).toEqual([
      { kind: 'currency', currency: 'silver', amount: 99 },
    ]);
    expect(log.packs[0]?.collections.missions[0]?.successTexts[0]).toBe('Raport złożony.');

    log = rollbackPublication(log, 1);
    expect(log.currentRevision).toBe(1);
    expect(log.packs).toHaveLength(2);
    expect(resolvePinnedAction(log, eventAction)).toEqual(eventBefore);
    expect(resolvePinnedAction(log, startedOnSecond).rewards).toEqual([
      { kind: 'currency', currency: 'silver', amount: 99 },
    ]);
    const afterRollback = pinAction(log, {
      id: 'akcja-po-wycofaniu',
      kind: 'event',
      defId: 'event.noc',
    });
    expect(afterRollback.contentRevision).toBe(1);
    expect(resolvePinnedAction(log, afterRollback)).toEqual(eventBefore);
  });
});

describe('podgląd eventu', () => {
  const event = minimalPack('Raport.', 5).collections.events[0];
  if (!event) throw new Error('Brak eventu');

  it('przed startem, w trakcie, po końcu i gdy wyłączony — bez publikacji', () => {
    expect(previewEvent(event, new Date('2026-12-01T00:00:00.000Z')).phase).toBe('przed');
    expect(previewEvent(event, new Date('2027-01-01T12:00:00.000Z')).phase).toBe('trwa');
    expect(previewEvent(event, new Date('2027-01-03T00:00:00.000Z')).phase).toBe('po');
    expect(
      previewEvent({ ...event, enabled: false }, new Date('2027-01-01T12:00:00.000Z')).phase,
    ).toBe('wylaczony');
    expect(previewEvent(event, new Date('2026-12-01T00:00:00.000Z')).timezone).toBe('UTC');
  });
});

describe('zawartość eventu', () => {
  it('stary event bez misji, walk, historii i zadań zostaje poprawny', () => {
    const loaded = loadContentPack({
      format: 3,
      id: 'zapomniany-brzeg',
      revision: 1,
      label: 'Przed rozbudową eventu',
      collections: {
        bestiary: [],
        items: [],
        missions: [],
        locations: [],
        texts: [],
        events: [
          {
            id: 'event.noc',
            name: 'Noc Zmarłych',
            description: 'Stary opis.',
            startsAt: '2027-01-01T00:00:00.000Z',
            endsAt: '2027-01-02T00:00:00.000Z',
            timezone: 'UTC',
            enabled: true,
            rewards: [],
            modifiers: [],
          },
        ],
      },
    });
    const event = loaded.collections.events[0];
    expect(event?.missions).toEqual([]);
    expect(event?.battles).toEqual([]);
    expect(event?.lore).toEqual([]);
    expect(event?.tasks).toEqual([]);
    expect(event?.description).toBe('Stary opis.');
  });

  it('zadanie za misję eventu trzyma nagrodę i odrzuca nieznaną walkę', () => {
    const base = {
      format: 3,
      id: 'zapomniany-brzeg',
      revision: 0,
      label: 'Szkic',
      collections: {
        bestiary: [],
        items: [],
        missions: [],
        locations: [],
        texts: [],
        events: [
          {
            id: 'event.noc',
            name: 'Noc Zmarłych',
            description: 'Morze obchodzi ją bez nas.',
            startsAt: '2027-01-01T00:00:00.000Z',
            endsAt: '2027-01-02T00:00:00.000Z',
            timezone: 'UTC',
            enabled: true,
            rewards: [],
            modifiers: [],
            missions: [
              {
                id: 'event.misja.nabrzeze',
                name: 'Patrol w czasie święta',
                description: 'Policz łodzie, które wracają same.',
                successTexts: ['Raport złożony.'],
                failureTexts: ['Mgła.'],
              },
            ],
            battles: [
              {
                id: 'event.walka.topielec',
                name: 'Starcie na molo',
                description: 'Coś wstaje z wody.',
                foe: 'Topielec z płycizny',
              },
            ],
            lore: [
              {
                id: 'event.lore.swieto',
                title: 'Skąd się wzięła Noc',
                body: 'Rybacy gaszą latarnie i nie wymawiają imion.',
              },
            ],
            tasks: [
              {
                id: 'event.zadanie.lowy',
                name: 'Trzy łowy',
                description: 'Wygraj trzy walki na Kręgach w czasie eventu.',
                activity: 'huntWin',
                count: 3,
                rewards: [{ kind: 'currency', currency: 'silver', amount: 40 }],
              },
              {
                id: 'event.zadanie.misja',
                name: 'Odbierz misję święta',
                description: 'Ukończ patrol.',
                activity: 'eventMission',
                subjectId: 'event.misja.nabrzeze',
                count: 1,
                rewards: [{ kind: 'currency', currency: 'silver', amount: 15 }],
              },
            ],
          },
        ],
      },
    };
    const loaded = loadContentPack(base);
    const event = loaded.collections.events[0];
    expect(event?.tasks[0]?.rewards).toEqual([
      { kind: 'currency', currency: 'silver', amount: 40 },
    ]);
    expect(event?.missions[0]?.rewards).toEqual([]);
    const eventDraft = base.collections.events[0];
    const secondTask = eventDraft?.tasks[1];
    if (!eventDraft || !secondTask) throw new Error('Brak zadania');
    expect(() =>
      loadContentPack({
        ...base,
        collections: {
          ...base.collections,
          events: [
            {
              ...eventDraft,
              tasks: [
                eventDraft.tasks[0],
                { ...secondTask, activity: 'eventBattle', subjectId: 'event.walka.nie-ma' },
              ],
            },
          ],
        },
      }),
    ).toThrow(/nieznaną walkę/);
  });
});

describe('dane statyczne', () => {
  it('składają się w poprawną paczkę bazową', () => {
    const pack = assertBaselineContent();
    expect(pack.collections.missions.some((mission) => mission.id === 'order.quay-patrol')).toBe(
      true,
    );
    expect(pack.collections.bestiary.some((enemy) => enemy.id === 'enemy.canal-rat')).toBe(true);
    expect(pack.collections.bestiary.some((enemy) => enemy.id === 'enemy.morgue-drowned')).toBe(
      true,
    );
    expect(pack.collections.items.some((item) => item.id === 'consumable.potion')).toBe(true);
    expect(
      pack.collections.locations.some((location) => location.id === 'location.sol.morgue'),
    ).toBe(true);
    expect(pack.collections.texts.some((text) => text.id === 'text.enemy.canal-rat')).toBe(true);
    expect(pack.collections.events).toEqual([]);
  });
});
