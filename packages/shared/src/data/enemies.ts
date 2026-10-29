/**
 * Dane statyczne: wrogowie Łowów (GDD 5.3, 10.4). Statystyki nie są tu zapisane —
 * wynikają z piętra, na którym wróg trafia na tablicę (`enemyStat`, `enemyLife`,
 * `enemyDamage`). Dane opisują tożsamość, Kręgi i Grozę (GDD 6.1).
 */
export interface EnemyDef {
  id: string;
  name: string;
  description: string;
  /** Krąg, w którym wróg się pojawia (9 = IX). */
  circle: number;
  /** Nazwany: szczyt zakresu Kręgu, +10% statystyk, liczy się do awansu. */
  named: boolean;
  /** Groza 0–10 (GDD 6.1). */
  dread: number;
  /** Czy używa *Spojrzenia* (GDD 6.1: wrogowie z Grozą ≥ 4 i wybrani nazwani). */
  gaze: boolean;
}

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'enemy.canal-rat',
    name: 'Szczur z Kanału',
    description: 'Wielki jak pies i bezczelny jak urzędnik.',
    circle: 9,
    named: false,
    dread: 0,
    gaze: false,
  },
  {
    id: 'enemy.drunk-smuggler',
    name: 'Pijany przemytnik',
    description: 'Zapomniał, co przemyca, ale pamięta, gdzie ma nóż.',
    circle: 9,
    named: false,
    dread: 0,
    gaze: false,
  },
  {
    id: 'enemy.barefoot-cultist',
    name: 'Bosonogi kultysta',
    description: 'Nuci coś, co nie ma melodii. Stopy ma sine od zimnej wody.',
    circle: 9,
    named: false,
    dread: 1,
    gaze: false,
  },
  {
    id: 'enemy.unblinking-gull',
    name: 'Mewa, która nie mruga',
    description: 'Siedzi na palu od trzech dni. Patrzy tylko na ciebie.',
    circle: 9,
    named: false,
    dread: 1,
    gaze: false,
  },
  {
    id: 'enemy.finger-crab',
    name: 'Krab z ludzkimi palcami',
    description: 'Zamiast nóg — palce. Stuka nimi o kamienie jak o klawisze.',
    circle: 9,
    named: false,
    dread: 2,
    gaze: false,
  },
  {
    id: 'enemy.shallow-drowned',
    name: 'Topielec z płycizny',
    description: 'Wstał z wodorostów przy falochronie. Jeszcze pamięta, jak się chodzi.',
    circle: 9,
    named: false,
    dread: 2,
    gaze: false,
  },
  {
    id: 'enemy.canal-butcher',
    name: 'Rzeźnik z Kanału',
    description: 'Rąbie wszystko, co wypłynie spod mostu. Ostatnio — także to, co nie wypłynęło.',
    circle: 9,
    named: true,
    dread: 1,
    gaze: false,
  },
  {
    id: 'enemy.sister-damp',
    name: 'Siostra Wilgoć',
    description: 'Mniszka bez klasztoru. Gdzie przejdzie, ściany zaczynają płakać.',
    circle: 9,
    named: true,
    dread: 3,
    gaze: false,
  },
  {
    id: 'enemy.knife-smuggler',
    name: 'Przemytnik z nożem',
    description: 'Ten jest trzeźwy. To gorzej.',
    circle: 8,
    named: false,
    dread: 0,
    gaze: false,
  },
  {
    id: 'enemy.dock-hound',
    name: 'Pies z doków',
    description: 'Ma obrożę z napisem w języku, którego nie zna nikt w Soli.',
    circle: 8,
    named: false,
    dread: 1,
    gaze: false,
  },
  {
    id: 'enemy.choir-cultist',
    name: 'Kultystka Chóru',
    description: 'Śpiewa jednym głosem z kimś, kogo nie widać.',
    circle: 8,
    named: false,
    dread: 1,
    gaze: false,
  },
  {
    id: 'enemy.arm-leech',
    name: 'Pijawka wielkości ramienia',
    description: 'Wpełzła z kanału do piwnicy. Teraz piwnica jest jej.',
    circle: 8,
    named: false,
    dread: 2,
    gaze: false,
  },
  {
    id: 'enemy.wide-eyed-fisher',
    name: 'Rybak o szeroko rozstawionych oczach',
    description: 'Mówi, że wypływa co noc. Nikt nie widział jego łodzi.',
    circle: 8,
    named: false,
    dread: 2,
    gaze: false,
  },
  {
    id: 'enemy.deep-scout',
    name: 'Głębinowiec-zwiadowca',
    description: 'Łuski na karku, skrzela pod kołnierzem. Liczy okna latarni.',
    circle: 8,
    named: false,
    dread: 3,
    gaze: false,
  },
  {
    id: 'enemy.boatswain-kreel',
    name: 'Bosman Kreel',
    description: 'Prowadzi przemyt od trzydziestu lat. Ani razu nie wyszedł na ląd w dzień.',
    circle: 8,
    named: true,
    dread: 1,
    gaze: false,
  },
  {
    id: 'enemy.eel-mother',
    name: 'Matka Węgorzy',
    description: 'Gniazdo ma w zatopionej kaplicy. Węgorze wracają do niej co noc.',
    circle: 8,
    named: true,
    dread: 4,
    gaze: true,
  },
  {
    id: 'enemy.void-priest',
    name: 'Kapłan Chóru Pustki',
    description: 'Ma zaszyte usta. Mimo to słychać, jak się modli.',
    circle: 7,
    named: false,
    dread: 2,
    gaze: false,
  },
  {
    id: 'enemy.brotherhood-tracker',
    name: 'Tropiciel Bractwa',
    description: 'Ktoś zapłacił za twoją głowę. Nie pytaj kto — on też nie pytał.',
    circle: 7,
    named: false,
    dread: 1,
    gaze: false,
  },
  {
    id: 'enemy.fog-hound',
    name: 'Ogar z mgły',
    description: 'Słychać go, zanim mgła zgęstnieje. Potem już nic nie słychać.',
    circle: 7,
    named: false,
    dread: 2,
    gaze: false,
  },
  {
    id: 'enemy.deep-one',
    name: 'Głębinowiec',
    description: 'Już się nie ukrywa. Woda kapie z niego, nawet gdy nie pada.',
    circle: 7,
    named: false,
    dread: 3,
    gaze: false,
  },
  {
    id: 'enemy.blind-gravedigger',
    name: 'Ślepy grabarz',
    description: 'Kopie groby na klifie. Twierdzi, że zmarli sami mu mówią, gdzie.',
    circle: 7,
    named: false,
    dread: 1,
    gaze: false,
  },
  {
    id: 'enemy.under-pier-thing',
    name: 'Rzecz spod pomostu',
    description: 'Nikt nie widział jej w całości. Ci, którzy widzieli więcej, nie wrócili.',
    circle: 7,
    named: false,
    dread: 4,
    gaze: true,
  },
  {
    id: 'enemy.brother-whisper',
    name: 'Brat Szept',
    description: 'Przewodzi Chórowi w Soli. Nigdy nie podnosi głosu — nie musi.',
    circle: 7,
    named: true,
    dread: 2,
    gaze: false,
  },
  {
    id: 'enemy.keel-swimmer',
    name: 'Ten, Który Pływa Pod Kilem',
    description: 'Rybacy wiedzą, kiedy przepływa: łodzie milkną, a sieci wracają puste.',
    circle: 7,
    named: true,
    dread: 5,
    gaze: true,
  },
];

/**
 * Topielec z samouczka *Przebudzenie w kostnicy* (GDD 3.3). Walka bez kosztu i bez
 * ryzyka śmierci; statystyki stałe, słabsze niż piętro 1.
 */
export const TUTORIAL_ENEMY = {
  id: 'enemy.morgue-drowned',
  name: 'Topielec ze stołu obok',
  description: 'Leżał pod tym samym prześcieradłem co ty. Wstał chwilę później.',
  circle: 9,
  named: false,
  dread: 1,
  gaze: false,
} as const satisfies EnemyDef;

export const TUTORIAL_ENEMY_STATS = {
  strength: 8,
  defense: 8,
  accuracy: 8,
  evasion: 8,
  life: 40,
  damage: 5,
  level: 1,
} as const;

const ENEMIES_BY_ID = new Map<string, EnemyDef>(
  [...ENEMIES, TUTORIAL_ENEMY].map((enemy) => [enemy.id, enemy]),
);

export function findEnemy(id: string): EnemyDef | undefined {
  return ENEMIES_BY_ID.get(id);
}

export function enemiesOfCircle(circle: number, named: boolean): EnemyDef[] {
  return ENEMIES.filter((enemy) => enemy.circle === circle && enemy.named === named);
}
