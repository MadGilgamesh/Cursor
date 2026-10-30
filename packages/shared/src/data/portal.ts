/**
 * Domeny 1–8 Portalu (GDD 5.12.2–5.12.4) i 30 Ech Seansu do rzadkości Widma.
 * Echa bogów (boss Etapu 5 i herold Etapu 9) są poza pulą Seansu.
 */
import type { EchoRarity, PortalModifier } from '../portal.js';

export interface PortalDomainDef {
  domain: number;
  god: string;
  place: string;
  modifier: PortalModifier;
  modifierName: string;
  materialId: string;
  materialName: string;
  /** Jednostki Etapów 1→10 (GDD 5.12.4). */
  units: readonly string[];
}

export const PORTAL_DOMAINS: readonly PortalDomainDef[] = [
  {
    domain: 1,
    god: 'Bokrug',
    place: 'Jezioro Ib i Ruiny Sarnath',
    modifier: 'ib-vengeance',
    modifierName: 'Zemsta Ib',
    materialId: 'ib-stone',
    materialName: 'Zielony Kamień Ib',
    units: [
      'Żabie Dzieci Ib',
      'Bezgłośni z Ib',
      'Topielcy z Sarnath',
      'Kapłani Idola',
      'Jaszczurze Ogary',
      'Kamienni Strażnicy Idola',
      'Wodne Jaszczury',
      'Biesiadnicy Ostatniej Uczty',
      'Duch Nargis-Hei i jego dwór',
      'Bokrug',
    ],
  },
  {
    domain: 2,
    god: 'Dagon i Matka Hydra',
    place: "Y'ha-nthlei pod Rafą Diabła",
    modifier: 'pressure',
    modifierName: 'Ciśnienie',
    materialId: 'deep-scale',
    materialName: 'Łuska Głębinowca',
    units: [
      'Wyznawcy Ezoterycznego Zakonu Dagona',
      'Przemienieni z portu',
      'Głębinowcy-zwiadowcy',
      'Głębinowcy-łowcy',
      'Kapłanki w Tiarach',
      'Strażnicy Rafy Diabła',
      'Starsi Głębinowcy',
      'Pomiot Hydry',
      'Matka Hydra',
      'Ojciec Dagon',
    ],
  },
  {
    domain: 3,
    god: 'Kolor spoza Przestworzy',
    place: 'Szara farma i studnia',
    modifier: 'drain',
    modifierName: 'Wysysanie',
    materialId: 'colour-ash',
    materialName: 'Popiół Koloru',
    units: [
      'Poszarzałe Zwierzęta',
      'Spaczone Drzewa',
      'Rodzina z Farmy',
      'Pnącza ze Studni',
      'Świetliki Koloru',
      'Szare Kolosy',
      'Globule z Meteorytu',
      'Płonąca Studnia',
      'Rój Kolorów',
      'Kolor',
    ],
  },
  {
    domain: 4,
    god: 'Ghaal-Tureth',
    place: 'Komora Serca pod Górami',
    modifier: 'pulse',
    modifierName: 'Tętno Skały',
    materialId: 'vein-blood',
    materialName: 'Żyła Kamiennej Krwi',
    units: [
      'Słuchacze Tętna',
      'Zasypani',
      'Żyłowce',
      'Geodowe Oczy',
      'Skamieliny Przebudzone',
      'Kapłani Żyły',
      'Kościste Kolosy',
      'Strażnik Komory',
      'Pierwszy Skurcz',
      'Ghaal-Tureth, Serce pod Górami',
    ],
  },
  {
    domain: 5,
    god: 'Nodens',
    place: 'Muszlowy Szlak nad Otchłanią',
    modifier: 'judgment',
    modifierName: 'Sąd Pradawnego',
    materialId: 'shell-light',
    materialName: 'Światło Muszli',
    units: [
      'Młode Bezlice',
      'Bezlice',
      'Trytoni',
      'Muszlowi Jeźdźcy',
      'Stada Bezlicych',
      'Trytoni Wojenni',
      'Konchowi Heroldzi',
      'Rydwan Otchłani',
      'Wielki Bezlicy',
      'Nodens Siwobrody',
    ],
  },
  {
    domain: 6,
    god: 'Król w Żółci',
    place: 'Carcosa nad Jeziorem Hali',
    modifier: 'yellow-sign',
    modifierName: 'Żółty Znak',
    materialId: 'yellow-shred',
    materialName: 'Strzęp Żółtego Płaszcza',
    units: [
      'Zamaskowani Widzowie',
      'Aktorzy Pierwszego Aktu',
      'Fantomy Prawdy',
      'Blade Maski',
      'Nosiciele Żółtego Znaku',
      'Mieszkańcy Carcosy',
      'Dzieci Czarnych Gwiazd',
      'Cassilda i Camilla',
      'Nieznajomy w Masce',
      'Król w Żółci',
    ],
  },
  {
    domain: 7,
    god: 'Shub-Niggurath',
    place: 'Las Tysiąca Młodych',
    modifier: 'fertility',
    modifierName: 'Płodność',
    materialId: 'goat-blood',
    materialName: 'Kozia Krew',
    units: [
      'Kultyści Sabatu',
      'Koźli Ludzie z Gaju',
      'Mi-Go Zbieracze',
      'Rój Larw',
      'Strażnicy Kamiennych Kręgów',
      'Mięsne Drzewa',
      'Mi-Go Chirurdzy',
      'Młode Czarnej Kozy',
      'Matka Stada',
      'Shub-Niggurath',
    ],
  },
  {
    domain: 8,
    god: 'Cthulhu',
    place: "R'lyeh, Miasto Nieeuklidesowe",
    modifier: 'rlyeh-dreams',
    modifierName: "Sny R'lyeh",
    materialId: 'rlyeh-basalt',
    materialName: "Bazalt R'lyeh",
    units: [
      'Kultyści z Bagien',
      'Zaginiona Załoga',
      'Głębinowcy Cthulhu',
      'Śniący Kapłani',
      'Strażnicy Monolitów',
      'Pomiot z Gwiazd',
      'Starszy Pomiot',
      'Wrota Grobowca',
      "Herold z R'lyeh",
      'Cthulhu Przebudzony',
    ],
  },
];

export function portalDomain(domain: number): PortalDomainDef | undefined {
  return PORTAL_DOMAINS.find((entry) => entry.domain === domain);
}

export function portalUnitName(domain: number, stage: number): string {
  return portalDomain(domain)?.units[stage - 1] ?? 'Sługa spoza snu';
}

export interface EchoDef {
  id: string;
  name: string;
  rarity: EchoRarity;
  /** Którą statystykę wzmacnia opis; mnożnik i tak obejmuje wszystkie cztery. */
  aspect: 'strength' | 'defense' | 'accuracy' | 'evasion';
  /** Echo boga — nie wpada w Seansie, tylko z bossa Domeny. */
  godDomain: number | null;
}

const SEANCE_NAMES = [
  'Latarnik bez Oczu',
  'Utopiona Narzeczona',
  'Dziecko z Ołowianym Uśmiechem',
  'Szara Uczona Ysolde',
  'Kapitan Oberth',
  'Psałterzysta z Kanału',
  'Wdowa od Trzeciej Świecy',
  'Chłopiec, który liczy fale',
  'Krawcowa Mgły',
  'Milczący Dzwonnik',
  'Pielęgniarka z Przytułku',
  'Rybak bez Cienia',
  'Doktor Halloran Vey',
  'Organista z Katedry',
  'Bliźnięta z Jednym Oddechem',
  'Kartograf Rafy',
  'Ślepa Przepowiadaczka',
  'Sternik „Miłosierdzia”',
  'Dziewczynka z Mokrą Lalką',
  'Notariusz Topielców',
  'Rzeźnik z Kanału',
  'Matka od Soli',
  'Strażnik Progu',
  'Poeta z Zatopionej Loży',
  'Lekarka Godziny Wilka',
  'Chórzysta bez Ust',
  'Cassilda z Przymierza',
  'Herold Odległego Portu',
  'Pani Tiary',
  'Ten, który wrócił z Ib',
] as const;

const ASPECTS = ['strength', 'defense', 'accuracy', 'evasion'] as const;

function rarityAt(index: number): EchoRarity {
  if (index < 12) return 'whisper';
  if (index < 20) return 'apparition';
  if (index < 26) return 'wraith';
  return 'phantom';
}

/** 30 Ech Seansu: 12 Szeptów, 8 Zjaw, 6 Upiorów, 4 Widma. */
export const SEANCE_ECHOES: readonly EchoDef[] = SEANCE_NAMES.map((name, index) => ({
  id: `echo.seance.${index + 1}`,
  name,
  rarity: rarityAt(index),
  aspect: ASPECTS[index % ASPECTS.length] ?? 'strength',
  godDomain: null,
}));

export const GOD_ECHOES: readonly EchoDef[] = [
  {
    id: 'echo.god.bokrug.wraith',
    name: 'Kapłan Idola z Ib',
    rarity: 'wraith',
    aspect: 'strength',
    godDomain: 1,
  },
  {
    id: 'echo.god.bokrug.phantom',
    name: 'Duch Nargis-Hei',
    rarity: 'phantom',
    aspect: 'defense',
    godDomain: 1,
  },
  {
    id: 'echo.god.dagon.wraith',
    name: 'Kapłanka w Tiarze',
    rarity: 'wraith',
    aspect: 'evasion',
    godDomain: 2,
  },
  {
    id: 'echo.god.dagon.phantom',
    name: 'Matka Hydra',
    rarity: 'phantom',
    aspect: 'strength',
    godDomain: 2,
  },
  {
    id: 'echo.god.colour.wraith',
    name: 'Globul z Meteorytu',
    rarity: 'wraith',
    aspect: 'accuracy',
    godDomain: 3,
  },
  {
    id: 'echo.god.colour.phantom',
    name: 'Rój Kolorów',
    rarity: 'phantom',
    aspect: 'evasion',
    godDomain: 3,
  },
  {
    id: 'echo.god.ghaal.wraith',
    name: 'Brygadzista Hollis, który usłyszał tętno',
    rarity: 'wraith',
    aspect: 'defense',
    godDomain: 4,
  },
  {
    id: 'echo.god.ghaal.phantom',
    name: 'Marethe, Kapłanka Żyły',
    rarity: 'phantom',
    aspect: 'strength',
    godDomain: 4,
  },
  {
    id: 'echo.god.nodens.wraith',
    name: 'Wielki Bezlicy',
    rarity: 'wraith',
    aspect: 'evasion',
    godDomain: 5,
  },
  {
    id: 'echo.god.nodens.phantom',
    name: 'Nodens Siwobrody',
    rarity: 'phantom',
    aspect: 'defense',
    godDomain: 5,
  },
  {
    id: 'echo.god.hastur.wraith',
    name: 'Cassilda i Camilla',
    rarity: 'wraith',
    aspect: 'evasion',
    godDomain: 6,
  },
  {
    id: 'echo.god.hastur.phantom',
    name: 'Nieznajomy w Masce',
    rarity: 'phantom',
    aspect: 'accuracy',
    godDomain: 6,
  },
  {
    id: 'echo.god.shub.wraith',
    name: 'Strażnik Kamiennego Kręgu',
    rarity: 'wraith',
    aspect: 'strength',
    godDomain: 7,
  },
  {
    id: 'echo.god.shub.phantom',
    name: 'Matka Stada',
    rarity: 'phantom',
    aspect: 'defense',
    godDomain: 7,
  },
  {
    id: 'echo.god.cthulhu.wraith',
    name: 'Strażnik Monolitu',
    rarity: 'wraith',
    aspect: 'defense',
    godDomain: 8,
  },
  {
    id: 'echo.god.cthulhu.phantom',
    name: "Herold z R'lyeh",
    rarity: 'phantom',
    aspect: 'strength',
    godDomain: 8,
  },
];

export const ECHOES: readonly EchoDef[] = [...SEANCE_ECHOES, ...GOD_ECHOES];

export function findEcho(id: string): EchoDef | undefined {
  return ECHOES.find((echo) => echo.id === id);
}

export function seanceEchoesOf(rarity: EchoRarity): readonly EchoDef[] {
  return SEANCE_ECHOES.filter((echo) => echo.rarity === rarity);
}

/** Boss Etapu 5 daje Upiora, herold Etapu 9 daje Widmo (GDD 5.12.6). */
export function godEchoForClear(
  domain: number,
  stage: number,
  substage: number,
): EchoDef | undefined {
  if (substage !== 8) return undefined;
  const rarity = stage === 5 ? 'wraith' : stage === 9 ? 'phantom' : null;
  if (!rarity) return undefined;
  return GOD_ECHOES.find((echo) => echo.godDomain === domain && echo.rarity === rarity);
}
