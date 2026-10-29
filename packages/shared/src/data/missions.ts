/**
 * Dane statyczne: zlecenia (GDD 5.9, 8.3). Wersjonowane w repo, walidowane przy
 * starcie serwera i w testach. Encje graczy odwołują się do `id`.
 *
 * Etap 0 zawiera wyłącznie „zlecenia próbne” Urzędu ds. Przebudzonych: zawsze
 * udane, służą do sprawdzenia timerów, księgi walut i powiadomień. Pełne Zlecenia
 * (szansa sukcesu, porażki, pętla 11, biegłość, frakcje) przychodzą w Etapie 1.
 */
import type { MissionTierId } from '../balance.js';

export interface MissionOutcome {
  /** Waga w losowaniu wariantu opisu (deterministycznie z ziarna aktywności). */
  weight: number;
  text: string;
}

export interface MissionDef {
  id: string;
  name: string;
  description: string;
  tierId: MissionTierId;
  outcomes: readonly MissionOutcome[];
}

export const MISSIONS: readonly MissionDef[] = [
  {
    id: 'trial.wreck-search',
    name: 'Przeszukanie wraku przy falochronie',
    description:
      'Urząd chce wiedzieć, co przyniósł nocny przypływ. Formularz w trzech egzemplarzach.',
    tierId: 'm5',
    outcomes: [
      { weight: 3, text: 'W ładowni tylko mokre skrzynie i zapach czegoś, co nie jest rybą.' },
      { weight: 2, text: 'Ktoś wyrył od środka kadłuba ten sam znak. Wiele razy.' },
      { weight: 1, text: 'Zostawiasz wrak szybciej, niż planowałeś. Nie oglądasz się.' },
    ],
  },
  {
    id: 'trial.kelp-harvest',
    name: 'Zbiór morskiej rzęsy',
    description: 'Apteka św. Agaty płaci za rzęsę z płycizn. Zbieraj, zanim zrobi się ciemno.',
    tierId: 'm15',
    outcomes: [
      { weight: 3, text: 'Kosz pełny. Rzęsa jest cieplejsza, niż powinna.' },
      { weight: 1, text: 'Coś pod wodą odprowadza cię wzrokiem aż do brzegu.' },
    ],
  },
  {
    id: 'trial.amber-ebb',
    name: 'Bursztyn z odpływu',
    description:
      'Odpływ odsłonił czarny piasek. Bursztyn to bursztyn, nawet jeśli coś w nim pływa.',
    tierId: 'h1',
    outcomes: [
      { weight: 2, text: 'W jednej bryłce zastygło oko. Mruga, gdy nikt nie patrzy.' },
      { weight: 3, text: 'Wracasz z pełną sakwą i piaskiem w każdej kieszeni.' },
    ],
  },
];
