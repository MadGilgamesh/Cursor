/**
 * Domeny 1–2 Portalu (GDD 5.12.2–5.12.4) i 30 Ech Seansu do rzadkości Widma.
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
