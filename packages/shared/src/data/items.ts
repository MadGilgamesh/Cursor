/**
 * Dane statyczne: przedmioty (GDD 5.5, 8.2 `ItemDef`). Etap 1: Stopnie 1–3,
 * zestawy trzech klas (Rzeźnik, Okultysta, Strzelec), akcesoria i talizmany
 * bez klasy, konsumpcja (mikstura, laudanum, Kawa z Kresu) i śmieci z Łowów.
 */
import type { CombatStat, EquipmentSlot, SetClassId } from '../balance.js';

export interface GearDef {
  id: string;
  kind: 'gear';
  name: string;
  slot: EquipmentSlot;
  tier: number;
  /** Klasa zestawu; `null` — przedmiot bez klasy (akcesorium, talizman). */
  classId: SetClassId | null;
  /** Premie do statystyk na Stopniu 1, jakości 100% i rzadkości Zwykły (punkty bazowe). */
  baseBonusBp: Partial<Record<CombatStat, number>>;
  /** Życie na Stopniu 1 i jakości 100%. */
  baseLife: number;
}

export const CONSUMABLE_EFFECTS = ['heal', 'laudanum', 'coffee'] as const;
export type ConsumableEffect = (typeof CONSUMABLE_EFFECTS)[number];

export interface ConsumableDef {
  id: string;
  kind: 'consumable';
  name: string;
  description: string;
  effect: ConsumableEffect;
  /** Wartość w srebrze (cena w sklepie; odkup 30%). */
  value: number;
  /** Czy sklep miejski ma to w stałej ofercie. */
  sold: boolean;
}

export interface JunkDef {
  id: string;
  kind: 'junk';
  name: string;
  description: string;
  value: number;
  /** Krąg Łowów, z którego wypada. */
  circle: number;
}

export type ItemDef = GearDef | ConsumableDef | JunkDef;

type ArmorTemplate = Record<
  'head' | 'torso' | 'legs' | 'hands' | 'feet',
  { bonus: Partial<Record<CombatStat, number>>; life: number }
>;

/** Rozkład premii pancerza klas — pełny zestaw Stopnia 1 daje ok. +25% (GDD 10.3: ×1,2 w dniu 1). */
const ARMOR_TEMPLATES: Record<SetClassId, ArmorTemplate> = {
  butcher: {
    head: { bonus: { defense: 300, strength: 200 }, life: 4 },
    torso: { bonus: { defense: 600 }, life: 12 },
    legs: { bonus: { defense: 300, evasion: 200 }, life: 6 },
    hands: { bonus: { strength: 500 }, life: 4 },
    feet: { bonus: { evasion: 300, defense: 200 }, life: 6 },
  },
  occultist: {
    head: { bonus: { accuracy: 500 }, life: 3 },
    torso: { bonus: { defense: 400, accuracy: 200 }, life: 8 },
    legs: { bonus: { evasion: 400 }, life: 5 },
    hands: { bonus: { accuracy: 300, strength: 200 }, life: 3 },
    feet: { bonus: { evasion: 400 }, life: 5 },
  },
  marksman: {
    head: { bonus: { accuracy: 400 }, life: 3 },
    torso: { bonus: { evasion: 300, defense: 300 }, life: 10 },
    legs: { bonus: { evasion: 500 }, life: 5 },
    hands: { bonus: { accuracy: 500 }, life: 3 },
    feet: { bonus: { evasion: 300, strength: 200 }, life: 5 },
  },
};

/** Nazwy kolejno dla Stopni 1–3. */
const GEAR_NAMES: Record<
  SetClassId,
  Record<Exclude<EquipmentSlot, 'accessory' | 'talisman'>, readonly [string, string, string]>
> = {
  butcher: {
    weapon: ['Tasak z rybnego targu', 'Harpun wielorybnika', 'Łom kapitana portu'],
    head: ['Kaptur z dratwy', 'Hełm nurka bez szybki', 'Kolczy czepiec rybacki'],
    torso: ['Skórzany fartuch', 'Kolczuga rybacka', 'Fartuch z rekiniej skóry'],
    legs: ['Nogawice z ceraty', 'Spodnie z foczej skóry', 'Kolcze nogawice'],
    hands: ['Rękawice rzeźnika', 'Rękawice z haczykami', 'Karwasze z łusek'],
    feet: ['Gumowce z targu', 'Buty z podkutą podeszwą', 'Buty obszyte kolczugą'],
  },
  occultist: {
    weapon: ['Sztylet rytualny', 'Grimuar w rybiej skórze', 'Grimuar Szarej Uczonej'],
    head: ['Maska z papier-mâché', 'Maska z dziobem', 'Maska z kości wieloryba'],
    torso: ['Szata nowicjusza', 'Szata haftowana w gwiazdy', 'Szata z Ilmaru'],
    legs: ['Spodnie z płótna żaglowego', 'Szarawary z Ilmaru', 'Spodnie haftowane srebrem'],
    hands: ['Rękawiczki z koźlej skóry', 'Rękawiczki z pieczęciami', 'Rękawice z wyszytym okiem'],
    feet: ['Trzewiki pielgrzyma', 'Ciżmy kopisty', 'Ciżmy z Archiwum'],
  },
  marksman: {
    weapon: ['Rewolwer bębenkowy', 'Kusza z wraku', 'Sztucer latarnika'],
    head: ['Kapelusz z szerokim rondem', 'Kaszkiet z goglami', 'Kaptur z lunetą'],
    torso: ['Płaszcz z kauczuku', 'Lekka kamizelka', 'Płaszcz z woskowanego płótna'],
    legs: ['Spodnie myśliwskie', 'Spodnie z ładownicami', 'Spodnie zwiadowcy'],
    hands: ['Rękawice bez palców', 'Rękawice strzelca', 'Rękawice z karwaszem'],
    feet: ['Trzewiki wędrowne', 'Buty z cholewą', 'Buty zwiadowcy'],
  },
};

const CLASSLESS_NAMES = {
  accessory: ['Mosiężny sygnet', 'Amulet z zębem rekina', 'Sygnet z czarną perłą'],
  talisman: ['Ususzona rozgwiazda', 'Relikwia z kości palca', 'Fetysz z włosów topielca'],
} as const;

const TIERS = [1, 2, 3] as const;

function buildGear(): GearDef[] {
  const gear: GearDef[] = [];
  for (const classId of ['butcher', 'occultist', 'marksman'] as const) {
    const names = GEAR_NAMES[classId];
    for (const tier of TIERS) {
      gear.push({
        id: `gear.${classId}.weapon.${tier}`,
        kind: 'gear',
        name: names.weapon[tier - 1] ?? names.weapon[0],
        slot: 'weapon',
        tier,
        classId,
        baseBonusBp: {},
        baseLife: 0,
      });
      for (const slot of ['head', 'torso', 'legs', 'hands', 'feet'] as const) {
        const template = ARMOR_TEMPLATES[classId][slot];
        gear.push({
          id: `gear.${classId}.${slot}.${tier}`,
          kind: 'gear',
          name: names[slot][tier - 1] ?? names[slot][0],
          slot,
          tier,
          classId,
          baseBonusBp: template.bonus,
          baseLife: template.life,
        });
      }
    }
  }
  for (const tier of TIERS) {
    gear.push({
      id: `gear.any.accessory.${tier}`,
      kind: 'gear',
      name: CLASSLESS_NAMES.accessory[tier - 1] ?? CLASSLESS_NAMES.accessory[0],
      slot: 'accessory',
      tier,
      classId: null,
      baseBonusBp: { strength: 200 },
      baseLife: 15,
    });
    gear.push({
      id: `gear.any.talisman.${tier}`,
      kind: 'gear',
      name: CLASSLESS_NAMES.talisman[tier - 1] ?? CLASSLESS_NAMES.talisman[0],
      slot: 'talisman',
      tier,
      classId: null,
      baseBonusBp: { strength: 200, defense: 200, accuracy: 200, evasion: 200 },
      baseLife: 0,
    });
  }
  return gear;
}

export const GEAR: readonly GearDef[] = buildGear();

export const CONSUMABLES: readonly ConsumableDef[] = [
  {
    id: 'consumable.potion',
    kind: 'consumable',
    name: 'Mikstura lecznicza',
    description:
      'Gorzka, mętna, z apteki św. Agaty. Zasklepia rany; w Przytułku skraca pobyt. Uzależnia.',
    effect: 'heal',
    value: 60,
    sold: true,
  },
  {
    id: 'consumable.laudanum',
    kind: 'consumable',
    name: 'Laudanum',
    description:
      'Kilka kropli i szepty cichną. Na chwilę. Przywraca Poczytalność; silnie uzależnia.',
    effect: 'laudanum',
    value: 120,
    sold: true,
  },
  {
    id: 'consumable.coffee',
    kind: 'consumable',
    name: 'Kawa z Kresu',
    description: 'Czarna jak Morze i równie ciężka. Dodaje Wigoru, także ponad limit.',
    effect: 'coffee',
    value: 100,
    sold: false,
  },
];

export const JUNK: readonly JunkDef[] = [
  {
    id: 'junk.button',
    kind: 'junk',
    name: 'Zardzewiały guzik munduru',
    description: 'Z orłem, którego nikt w Soli nie rozpoznaje.',
    value: 8,
    circle: 9,
  },
  {
    id: 'junk.shell',
    kind: 'junk',
    name: 'Muszla z wyrytym znakiem',
    description: 'Znak jest wyryty od środka.',
    value: 12,
    circle: 9,
  },
  {
    id: 'junk.kelp',
    kind: 'junk',
    name: 'Kłąb wodorostów z zębami',
    description: 'Zęby są ludzkie. Wodorosty chyba też coś jadły.',
    value: 6,
    circle: 9,
  },
  {
    id: 'junk.coin',
    kind: 'junk',
    name: 'Mokra moneta z obcym profilem',
    description: 'Nigdy nie wysycha. Profil ma o jedno oko za dużo.',
    value: 20,
    circle: 8,
  },
  {
    id: 'junk.doll-eye',
    kind: 'junk',
    name: 'Szklane oko lalki',
    description: 'Obraca się w dłoni w stronę morza.',
    value: 25,
    circle: 8,
  },
  {
    id: 'junk.scale',
    kind: 'junk',
    name: 'Łuska wielkości dłoni',
    description: 'Zimna nawet w ogniu.',
    value: 30,
    circle: 8,
  },
  {
    id: 'junk.tooth',
    kind: 'junk',
    name: 'Ząb, który nie jest ludzki',
    description: 'Ma korzeń zakręcony jak muszla.',
    value: 45,
    circle: 7,
  },
  {
    id: 'junk.vial',
    kind: 'junk',
    name: 'Fiolka czarnej wody',
    description: 'Nie odbija światła lampy.',
    value: 55,
    circle: 7,
  },
  {
    id: 'junk.ring',
    kind: 'junk',
    name: 'Pierścień z palcem w środku',
    description: 'Palec jest ciepły.',
    value: 60,
    circle: 7,
  },
  {
    id: 'junk.bell-bolt',
    kind: 'junk',
    name: 'Śruba z dzwonu nurka',
    description: 'Wciąż pachnie oliwą i czymś słodkim.',
    value: 70,
    circle: 6,
  },
  {
    id: 'junk.choir-tooth',
    kind: 'junk',
    name: 'Ząb z chóru rafy',
    description: 'Gdy przyłożysz do ucha, słychać kilka głosów.',
    value: 90,
    circle: 5,
  },
  {
    id: 'junk.black-mesh',
    kind: 'junk',
    name: 'Skrawek czarnej sieci',
    description: 'Nie da się go przeciąć nożem ze sklepu.',
    value: 110,
    circle: 4,
  },
];

export const ITEMS: readonly ItemDef[] = [...GEAR, ...CONSUMABLES, ...JUNK];

const ITEMS_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

export function findItem(id: string): ItemDef | undefined {
  return ITEMS_BY_ID.get(id);
}

export function findGear(id: string): GearDef | undefined {
  const item = ITEMS_BY_ID.get(id);
  return item?.kind === 'gear' ? item : undefined;
}

/** Broń klasy na Stopniu 1 — wybór w samouczku. */
export const starterWeaponId = (classId: SetClassId) => `gear.${classId}.weapon.1`;
