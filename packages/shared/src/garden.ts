/**
 * Ogród pod Księżycem (GDD 5.19).
 * Podlewanie w połowie fazy. Bez wody roślina usycha po 2× czasie fazy od tej chwili.
 */
import { HOUR_MS, MINUTE_MS } from './balance.js';

export const GARDEN_LEVEL = 8;
export const GARDEN_PLOTS = 4;
export const PLANT_EXPERIENCE = 5;
export const WATER_EXPERIENCE = 3;

export interface CropDef {
  id: string;
  name: string;
  phaseMs: number;
  harvestXp: number;
  /** Popiół Koloru albo nic. */
  fertilizer: 'colour-ash' | null;
  /** Skażenie przy zbiorze. Ziarno z meteorytu daje 1; reszta 0. */
  contamination: number;
  /** Cena nasiona u Zielarki. Założenie. */
  silver: number;
}

export const CROPS: readonly CropDef[] = [
  {
    id: 'wormwood',
    name: 'Piołun',
    phaseMs: HOUR_MS,
    harvestXp: 8,
    fertilizer: null,
    contamination: 0,
    silver: 12,
  },
  {
    id: 'mandrake',
    name: 'Mandragora',
    phaseMs: 2 * HOUR_MS,
    harvestXp: 14,
    fertilizer: null,
    contamination: 0,
    silver: 28,
  },
  {
    id: 'poppy',
    name: 'Czarny mak',
    phaseMs: 4 * HOUR_MS,
    harvestXp: 20,
    fertilizer: null,
    contamination: 0,
    silver: 40,
  },
  {
    id: 'shroom',
    name: 'Grzyb świecący',
    phaseMs: 90 * MINUTE_MS,
    harvestXp: 11,
    fertilizer: null,
    contamination: 0,
    silver: 18,
  },
  {
    id: 'reed',
    name: 'Trzcina solna',
    phaseMs: 45 * MINUTE_MS,
    harvestXp: 6,
    fertilizer: null,
    contamination: 0,
    silver: 8,
  },
  {
    id: 'meteor',
    name: 'Ziarno z meteorytu',
    phaseMs: 3 * HOUR_MS,
    harvestXp: 16,
    fertilizer: 'colour-ash',
    contamination: 1,
    silver: 0,
  },
];

export function findCrop(id: string): CropDef | undefined {
  return CROPS.find((crop) => crop.id === id);
}

export interface PlotState {
  cropId: string | null;
  plantedAt: number | null;
  wateredAt: number | null;
}

export const emptyPlot = (): PlotState => ({ cropId: null, plantedAt: null, wateredAt: null });

export type PlotPhase = 'empty' | 'growing' | 'thirsty' | 'ripening' | 'ready' | 'withered';

/** Chwila, w której wzrost staje i czeka na wodę. */
export function pauseAt(plantedAt: number, phaseMs: number): number {
  return plantedAt + phaseMs / 2;
}

/** Dokładny koniec okna: pauza + 2 × faza. */
export function witherAt(plantedAt: number, phaseMs: number): number {
  return pauseAt(plantedAt, phaseMs) + 2 * phaseMs;
}

export function plotPhase(plot: PlotState, now: number): PlotPhase {
  if (!plot.cropId || plot.plantedAt === null) return 'empty';
  const crop = findCrop(plot.cropId);
  if (!crop) return 'empty';
  const pause = pauseAt(plot.plantedAt, crop.phaseMs);
  const dead = witherAt(plot.plantedAt, crop.phaseMs);
  if (plot.wateredAt === null) {
    if (now < pause) return 'growing';
    if (now < dead) return 'thirsty';
    return 'withered';
  }
  const ready = plot.wateredAt + crop.phaseMs / 2;
  if (now < ready) return 'ripening';
  return 'ready';
}
