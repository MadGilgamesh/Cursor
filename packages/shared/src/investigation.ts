/**
 * Generator Spraw (GDD 6.3). Odpowiedź zostaje w strukturze serwerowej.
 * Odpowiedź publiczna buduje `publicCase` — bez ziarna i bez indeksu rozwiązania.
 */
import { createRng, type Rng } from './rng.js';

export const CASE_SCALES = ['minor', 'serious'] as const;
export type CaseScale = (typeof CASE_SCALES)[number];

export const CASE_QUESTIONS = ['who', 'where', 'intent'] as const;
export type CaseQuestionId = (typeof CASE_QUESTIONS)[number];

export const CLUE_SOURCES = ['search', 'interview', 'document', 'vision'] as const;
export type ClueSource = (typeof CLUE_SOURCES)[number];

export const QUESTION_PROMPTS: Record<CaseQuestionId, string> = {
  who: 'Kto?',
  where: 'Gdzie?',
  intent: 'Co zamierzają?',
};

const POOLS: Record<CaseQuestionId, readonly string[]> = {
  who: [
    'Latarnik Holst',
    'Doktor Vey',
    'Rybak Orlen',
    'Krawcowa Mgły',
    'Aptekarz Soli',
    'Kapłan Progu',
  ],
  where: [
    'Falochron',
    'Kostnica',
    'Magazyn Soli',
    'Kaplica Latarników',
    'Studnia przy Farze',
    'Archiwum Urzędu',
  ],
  intent: [
    'Rytuał o północy',
    'Przemyt ichoru',
    'Ofiara z imienia',
    'Kradzież pieczęci',
    'Wezwanie z głębi',
    'Ucieczka kutrem',
  ],
};

/** Mieszkańcy Soli w tym etapie (GDD 5.18). Miasta poza Solą wchodzą w Etapie 4. */
export const RESIDENTS = [
  { id: 'holst', name: 'Latarnik Holst' },
  { id: 'vey', name: 'Doktor Vey' },
  { id: 'orlen', name: 'Rybak Orlen' },
] as const;

export const MINOR_DEADLINE_HOURS = 24;
export const SERIOUS_DEADLINE_HOURS = 72;
/** Dokument: Drobna 30 min, Poważna 4 h (GDD 6.3). */
export const DOCUMENT_WAIT_MS = { minor: 30 * 60_000, serious: 4 * 60 * 60_000 } as const;
export const VISION_SANITY_COST = 4;
export const INTERVIEW_FAMILIARITY = 20;
export const INTERVIEW_INSIGHT = 5;
/** Ukryte tropy widać przy Rozchwianiu i niżej (próg 30%, GDD 6.1). */
export const HIDDEN_CLUE_SANITY_PERCENT = 30;

export interface ClueDef {
  id: string;
  source: ClueSource;
  question: CaseQuestionId;
  /** Indeks w opcjach pytania. Zostaje po stronie serwera, dopóki trop nie zostanie znaleziony. */
  pointsAt: number;
  truthful: boolean;
  hidden: boolean;
  knowledge: number;
  toil: number;
  sanity: number;
  waitMs: number;
  residentId: string | null;
}

export interface CaseBlueprint {
  scale: CaseScale;
  /** Bóg aspektu kultu (Domeny 1–3) — nagroda Poważnej Sprawy. */
  god: number;
  deadlineHours: number;
  options: Record<CaseQuestionId, readonly string[]>;
  solution: Record<CaseQuestionId, number>;
  clues: readonly ClueDef[];
}

export interface PublicClue {
  id: string;
  source: ClueSource;
  question: CaseQuestionId;
  found: boolean;
  toil: number;
  sanity: number;
  knowledge: number;
  waitMs: number;
  residentId: string | null;
  /** Ustawione dopiero po znalezieniu tropu pełnego. */
  supports?: number;
  /** Wizja: dwie odpowiedzi, bez wskazania która jest właściwa. */
  narrowed?: readonly number[];
}

export interface PublicCase {
  scale: CaseScale;
  god: number;
  deadlineHours: number;
  questions: readonly { id: CaseQuestionId; prompt: string; options: readonly string[] }[];
  clues: readonly PublicClue[];
}

const SECRET_KEYS = new Set([
  'solution',
  'pointsAt',
  'answerIndex',
  'correctIndex',
  'truthful',
  'seed',
]);

function shuffle(rng: Rng, items: readonly string[]): string[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = rng.nextInt(0, index);
    const current = copy[index];
    const other = copy[swap];
    if (current === undefined || other === undefined) continue;
    copy[index] = other;
    copy[swap] = current;
  }
  return copy;
}

function clue(
  source: ClueSource,
  question: CaseQuestionId,
  pointsAt: number,
  truthful: boolean,
  hidden: boolean,
  scale: CaseScale,
  residentId: string | null,
  toil: number,
): ClueDef {
  const document = source === 'document';
  return {
    id: hidden ? `hidden-${question}` : `${source}-${question}`,
    source,
    question,
    pointsAt,
    truthful,
    hidden,
    knowledge: document && scale === 'serious' ? 3 : 0,
    toil,
    sanity: source === 'vision' ? VISION_SANITY_COST : 0,
    waitMs: document ? DOCUMENT_WAIT_MS[scale] : 0,
    residentId,
  };
}

/** Sprawa z szablonu i ziarna. Ścieżka przeszukań zawsze pokrywa 3/3. */
export function generateCase(seed: string): CaseBlueprint {
  const rng = createRng(seed);
  const scale: CaseScale = rng.nextInt(0, 1) === 0 ? 'minor' : 'serious';
  const god = 1 + rng.nextInt(0, 2);
  const options = {} as Record<CaseQuestionId, readonly string[]>;
  const solution = {} as Record<CaseQuestionId, number>;
  const clues: ClueDef[] = [];

  CASE_QUESTIONS.forEach((question, index) => {
    const pool = POOLS[question];
    const count = 4 + rng.nextInt(0, 2);
    const chosen = shuffle(rng, pool).slice(0, count);
    const answer = rng.nextInt(0, chosen.length - 1);
    options[question] = chosen;
    solution[question] = answer;
    const resident = RESIDENTS[index % RESIDENTS.length] ?? RESIDENTS[0];
    const lie = rng.nextInt(0, 1) === 0;
    clues.push(
      clue('search', question, answer, true, false, scale, null, 3 + rng.nextInt(0, 2)),
      clue(
        'interview',
        question,
        lie ? (answer + 1) % chosen.length : answer,
        !lie,
        false,
        scale,
        resident.id,
        2,
      ),
      clue('document', question, answer, true, false, scale, null, 0),
      clue('vision', question, answer, true, false, scale, null, 0),
      clue('search', question, answer, true, true, scale, null, 3),
    );
  });

  return {
    scale,
    god,
    deadlineHours: scale === 'minor' ? MINOR_DEADLINE_HOURS : SERIOUS_DEADLINE_HOURS,
    options,
    solution,
    clues,
  };
}

/**
 * Ścieżka do 3/3 bez ukrytych tropów i bez progu Wiedzy.
 * Przeszukanie każdego pytania wskazuje właściwą odpowiedź.
 */
export function cluePath(blueprint: CaseBlueprint): string[] | null {
  const ids: string[] = [];
  for (const question of CASE_QUESTIONS) {
    const found = blueprint.clues.find(
      (entry) =>
        entry.question === question &&
        entry.source === 'search' &&
        !entry.hidden &&
        entry.truthful &&
        entry.knowledge === 0 &&
        entry.pointsAt === blueprint.solution[question],
    );
    if (!found) return null;
    ids.push(found.id);
  }
  return ids;
}

export function publicCase(
  blueprint: CaseBlueprint,
  found: readonly string[],
  sanityPercent: number,
): PublicCase {
  const foundSet = new Set(found);
  const clues = blueprint.clues
    .filter(
      (entry) =>
        !entry.hidden || sanityPercent <= HIDDEN_CLUE_SANITY_PERCENT || foundSet.has(entry.id),
    )
    .map((entry) => {
      const revealed = foundSet.has(entry.id);
      const publicClue: PublicClue = {
        id: entry.id,
        source: entry.source,
        question: entry.question,
        found: revealed,
        toil: entry.toil,
        sanity: entry.sanity,
        knowledge: entry.knowledge,
        waitMs: entry.waitMs,
        residentId: entry.residentId,
      };
      if (!revealed) return publicClue;
      if (entry.source === 'vision') {
        const width = blueprint.options[entry.question].length;
        return {
          ...publicClue,
          narrowed: [entry.pointsAt, (entry.pointsAt + 1) % width] as const,
        };
      }
      return { ...publicClue, supports: entry.pointsAt };
    });

  return {
    scale: blueprint.scale,
    god: blueprint.god,
    deadlineHours: blueprint.deadlineHours,
    questions: CASE_QUESTIONS.map((id) => ({
      id,
      prompt: QUESTION_PROMPTS[id],
      options: blueprint.options[id],
    })),
    clues,
  };
}

/** Czy JSON odpowiedzi zawiera klucz rozwiązania albo ziarno Spraw. */
export function leaksCaseSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => leaksCaseSecret(entry));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, inner]) => SECRET_KEYS.has(key) || leaksCaseSecret(inner),
  );
}

export function deductionScore(
  blueprint: CaseBlueprint,
  answers: Record<CaseQuestionId, number>,
): number {
  return CASE_QUESTIONS.reduce(
    (score, question) => score + (answers[question] === blueprint.solution[question] ? 1 : 0),
    0,
  );
}
