import { CITY_NAMES } from '@game/shared';

import type { TextRecord } from './schema.js';

/** Teksty wyniesione z danych statycznych i pulpitu, plus miasta z aktualnej mapy. */
const NOTES: readonly TextRecord[] = [
  {
    id: 'text.sol.awakening',
    title: 'Przebudzenie',
    body: 'Budzisz się na stole kostnicy. Morze wciąż szepcze.',
  },
  {
    id: 'text.enemy.canal-rat',
    title: 'Szczur z Kanału',
    body: 'Wielki jak pies i bezczelny jak urzędnik.',
  },
  {
    id: 'text.enemy.morgue-drowned',
    title: 'Topielec ze stołu obok',
    body: 'Leżał pod tym samym prześcieradłem co ty. Wstał chwilę później.',
  },
  {
    id: 'text.sol.night',
    title: 'Sól nocą',
    body: 'Sól nocą. Większość drzwi wciąż zamknięta na cztery spusty.',
  },
];

export const TEXTS: readonly TextRecord[] = [
  ...NOTES,
  ...(Object.entries(CITY_NAMES) as [keyof typeof CITY_NAMES, string][]).map(([id, name]) => ({
    id: `text.city.${id}`,
    title: name,
    body: `Miasto ${name} na aktualnej mapie Brzegu.`,
  })),
];
