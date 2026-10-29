/**
 * Postać w walce: statystyki efektywne, Życie ze sprzętu i aktywna klasa (GDD 5.1, 5.5).
 * Czysta logika — serwer liczy nią stan przy każdej akcji, klient pokazuje podgląd.
 */
import {
  ARMOR_SLOTS,
  CLASS_SET_ARMOR_PIECES,
  CLASS_UNIQUES,
  COMBAT_STATS,
  type ClassId,
  type CombatStat,
  type EquipmentSlot,
  type ItemRarity,
  type ResourceContext,
  STAT_SCALE,
  gearBonusBp,
  gearLife,
} from './balance.js';
import { findGear } from './data/items.js';

export type StatBlock = Record<CombatStat, number>;

export interface EquippedItem {
  itemId: string;
  slot: EquipmentSlot;
  qualityBp: number;
  rarity: ItemRarity;
  enhancement: number;
}

export interface Loadout {
  /** Premie sprzętu w punktach bazowych dla każdej statystyki. */
  bonusBp: StatBlock;
  lifeBonus: number;
  classId: ClassId | null;
  weapon: EquippedItem | null;
}

export const emptyStats = (): StatBlock => ({ strength: 0, defense: 0, accuracy: 0, evasion: 0 });

/**
 * Aktywna klasa (GDD 5.5): broń klasy + co najmniej 4 z 5 części pancerza tej klasy.
 * Broń i 4 dowolne części pancerza bez kompletu jednej klasy — Włóczęga.
 */
export function detectClass(equipped: readonly EquippedItem[]): ClassId | null {
  const weapon = equipped.find((item) => item.slot === 'weapon');
  if (!weapon) return null;
  const armor = equipped.filter((item) =>
    (ARMOR_SLOTS as readonly EquipmentSlot[]).includes(item.slot),
  );
  if (armor.length < CLASS_SET_ARMOR_PIECES) return null;
  const weaponClass = findGear(weapon.itemId)?.classId ?? null;
  if (weaponClass) {
    const matching = armor.filter((item) => findGear(item.itemId)?.classId === weaponClass);
    if (matching.length >= CLASS_SET_ARMOR_PIECES) return weaponClass;
  }
  return 'vagrant';
}

export function computeLoadout(equipped: readonly EquippedItem[]): Loadout {
  const bonusBp = emptyStats();
  let lifeBonus = 0;
  for (const item of equipped) {
    const def = findGear(item.itemId);
    if (!def) continue;
    for (const stat of COMBAT_STATS) {
      const base = def.baseBonusBp[stat];
      if (base) bonusBp[stat] += gearBonusBp(base, def.tier, item.qualityBp, item.rarity);
    }
    lifeBonus += gearLife(def.baseLife, def.tier, item.qualityBp);
  }
  return {
    bonusBp,
    lifeBonus,
    classId: detectClass(equipped),
    weapon: equipped.find((item) => item.slot === 'weapon') ?? null,
  };
}

/** Statystyka efektywna w setnych: bazowa × (1 + Σ premii sprzętu). */
export function effectiveStatsCenti(baseCenti: StatBlock, loadout: Loadout): StatBlock {
  const result = emptyStats();
  for (const stat of COMBAT_STATS) {
    result[stat] = Math.floor((baseCenti[stat] * (10_000 + loadout.bonusBp[stat])) / 10_000);
  }
  return result;
}

/** Setne części → punkty (do wzorów walki i szansy zleceń). */
export const statUnits = (centi: number) => centi / STAT_SCALE;

export function resourceContextFor(level: number, loadout: Loadout | null): ResourceContext {
  return {
    level,
    knowledge: 0,
    lifeBonus: loadout?.lifeBonus ?? 0,
    toilBonusBp: loadout?.classId === 'vagrant' ? CLASS_UNIQUES.vagrantToilBp : 0,
  };
}
