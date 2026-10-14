import { type FightingForceGroup } from "../google-sheets-api";

export const FORCE_ARMOR_OPTIONS = [
  { name: "None", ac: 10 },
  { name: "Leather or padded armor", ac: 8 },
  { name: "Studded leather or ring mail", ac: 7 },
  { name: "Scale mail", ac: 6 },
  { name: "Chain mail", ac: 5 },
  { name: "Splint or banded mail", ac: 4 },
  { name: "Plate mail", ac: 3 },
] as const;

export const FORCE_WEAPON_OPTIONS = [
  ["Arrow", "1-6", "1-6"],
  ["Axe, Battle", "1-8", "1-4"],
  ["Axe, Hand or throwing", "1-6", "1-4"],
  ["Bardiche", "2-8", "3-12"],
  ["Bec de corbin", "1-8", "1-6"],
  ["Bill-Guisarme", "2-8", "1-10"],
  ["Bo Stick", "1-6", "1-3"],
  ["Club", "1-6", "1-3"],
  ["Dagger", "1-4", "1-3"],
  ["Dart", "1-3", "1-2"],
  ["Fauchard", "1-6", "1-8"],
  ["Fauchard-Fork", "1-8", "1-10"],
  ["Flail, footman’s", "2-7", "2-8"],
  ["Flail, horseman’s", "2-5", "2-5"],
  ["Fork, Military", "1-8", "2-8"],
  ["Glaive", "1-6", "1-10"],
  ["Glaive-Guisarme", "2-8", "2-12"],
  ["Guisarme", "2-8", "1-8"],
  ["Guisarme-Voulge", "2-8", "2-8"],
  ["Halberd", "1-10", "2-12"],
  ["Hammer, lucern", "2-8", "1-6"],
  ["Hammer", "2-5", "1-4"],
  ["Javelin", "1-6", "1-6"],
  ["Jo Stick", "1-6", "1-4"],
  ["Lance (light horse)", "1-6", "1-8"],
  ["Lance (medium horse)", "2-7", "2-12"],
  ["Lance (heavy horse)", "3-9", "3-18"],
  ["Mace, footman’s", "2-7", "1-6"],
  ["Mace, horseman’s", "1-6", "1-4"],
  ["Morning Star", "2-8", "2-7"],
  ["Partisan", "1-6", "2-7"],
  ["Pick, Military, footman’s", "2-7", "2-8"],
  ["Pick, Military, horseman’s", "2-5", "1-4"],
  ["Pike, Awl", "1-6", "1-12"],
  ["Quarrel (or Bolt), light", "1-4", "1-4"],
  ["Quarrel (or Bolt), heavy", "2-5", "2-7"],
  ["Ranseur", "2-8", "2-8"],
  ["Scimitar", "1-8", "1-8"],
  ["Sling bullet", "2-5", "2-7"],
  ["Sling stone", "1-4", "1-4"],
  ["Spear", "1-6", "1-8"],
  ["Spetum", "2-7", "2-12"],
  ["Staff, Quarter", "1-6", "1-6"],
  ["Sword, Bastard", "2-8", "2-16"],
  ["Sword, Broad", "2-8", "2-7"],
  ["Sword, Long", "1-8", "1-12"],
  ["Sword, Short", "1-6", "1-8"],
  ["Sword, Two-handed", "1-10", "3-18"],
  ["Trident", "2-7", "3-12"],
  ["Voulge", "2-8", "2-8"],
].map(([name, damageSmallMedium, damageLarge]) => ({
  name,
  damageSmallMedium,
  damageLarge,
}));

export function forceArmorClass(armor: string, shield: boolean) {
  const base =
    FORCE_ARMOR_OPTIONS.find((option) => option.name === armor)?.ac ?? 10;
  return Math.max(2, base - (shield ? 1 : 0));
}

export function mergeIdenticalForceGroups(
  groups: FightingForceGroup[],
): FightingForceGroup[] {
  const merged = new Map<string, FightingForceGroup>();

  for (const group of groups) {
    const soldierType = String(group.soldierType || "").trim();
    const armor = String(group.armor || "None");
    const shield = Boolean(group.shield);
    const weaponNames = (
      group.weaponNames?.length
        ? group.weaponNames
        : group.weapons?.map((weapon) => weapon.name) || []
    )
      .map((name) => String(name).trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const key = JSON.stringify([
      soldierType.toLowerCase(),
      armor.toLowerCase(),
      shield,
      weaponNames.map((name) => name.toLowerCase()),
    ]);

    const existing = merged.get(key);
    if (existing) {
      existing.men = Number(existing.men || 0) + Number(group.men || 0);
      existing.missingSerjeants =
        Number(existing.missingSerjeants || 0) +
        Number(group.missingSerjeants || 0);
      continue;
    }

    merged.set(key, {
      ...group,
      rosterGroupId: group.rosterGroupId || crypto.randomUUID(),
      soldierType,
      armor,
      shield,
      armorClass: forceArmorClass(armor, shield),
      weaponNames,
      weapons: weaponNames.map(
        (name) =>
          FORCE_WEAPON_OPTIONS.find((weapon) => weapon.name === name) || {
            name,
            damageSmallMedium: "",
            damageLarge: "",
          },
      ),
      men: Number(group.men || 0),
      missingSerjeants: Number(group.missingSerjeants || 0),
    });
  }

  return Array.from(merged.values());
}
