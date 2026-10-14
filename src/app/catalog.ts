import { BookOpen, Castle, UsersRound, WalletCards } from "lucide-react";

import { Section } from "./core";
import { EquipmentItem } from "./wallet";
import { FORCE_ARMOR_OPTIONS, FORCE_WEAPON_OPTIONS } from "./forces";

export const navItems: {
  id: Section;
  label: string;
  icon: typeof WalletCards;
}[] = [
  { id: "wallet", label: "Wallet", icon: WalletCards },
  { id: "journal", label: "Journal", icon: BookOpen },
  { id: "retainers", label: "Hirelings", icon: UsersRound },
  { id: "territories", label: "Territories", icon: Castle },
];

export const RECRUITMENT_SOLDIER_TYPES = [
  { value: "archer (longbow)", label: "Archer (Longbow)" },
  { value: "archer (shortbow)", label: "Archer (Shortbow)" },
  { value: "artillerist", label: "Artillerist" },
  { value: "crossbowman", label: "Crossbowman" },
  { value: "footman, heavy", label: "Footman, Heavy" },
  { value: "footman, light", label: "Footman, Light" },
  { value: "footman, pikeman", label: "Footman, Pikeman" },
  { value: "hobilar, heavy", label: "Hobilar, Heavy" },
  { value: "hobilar, light", label: "Hobilar, Light" },
  { value: "horseman, archer", label: "Horseman, Archer" },
  { value: "horseman, crossbowman", label: "Horseman, Crossbowman" },
  { value: "horseman, heavy", label: "Horseman, Heavy" },
  { value: "horseman, light", label: "Horseman, Light" },
  { value: "horseman, medium", label: "Horseman, Medium" },
  { value: "sapper/miner", label: "Sapper/Miner" },
  { value: "slinger", label: "Slinger" },
] as const;

export const SOLDIER_MONTHLY_WAGES_GP: Record<string, number> = {
  "archer (longbow)": 4,
  "archer (shortbow)": 2,
  artillerist: 5,
  crossbowman: 2,
  "footman, heavy": 2,
  "footman, light": 1,
  "footman, pikeman": 3,
  "hobilar, heavy": 3,
  "hobilar, light": 2,
  "horseman, archer": 6,
  "horseman, crossbowman": 4,
  "horseman, heavy": 6,
  "horseman, light": 3,
  "horseman, medium": 4,
  "sapper/miner": 4,
  slinger: 3,
};

export function soldierWageBreakdown(
  soldierType: string,
  menValue: string | number,
) {
  const men = Math.max(0, Math.floor(Number(menValue) || 0));
  const normalizedType = soldierType.trim().toLowerCase();
  const baseWage = SOLDIER_MONTHLY_WAGES_GP[normalizedType];
  if (!men || baseWage === undefined) return null;
  const serjeants = Math.ceil(men / 10);
  const ordinary = men - serjeants;
  const monthlyTotal = ordinary * baseWage + serjeants * baseWage * 10;
  return { men, ordinary, serjeants, baseWage, monthlyTotal };
}

export const equipmentCatalog: EquipmentItem[] = [
  {
    category: "Armor",
    name: "Banded mail",
    amount: 90,
    coin: "gp",
    encumbrance: "350 coin",
  },
  {
    category: "Armor",
    name: "Chain mail",
    amount: 75,
    coin: "gp",
    encumbrance: "300 coin",
  },
  {
    category: "Armor",
    name: "Helmet, great",
    amount: 15,
    coin: "gp",
    encumbrance: "100 coin",
  },
  {
    category: "Armor",
    name: "Helmet, small",
    amount: 10,
    coin: "gp",
    encumbrance: "45 coin",
  },
  {
    category: "Armor",
    name: "Leather armor",
    amount: 5,
    coin: "gp",
    encumbrance: "150 coin",
  },
  {
    category: "Armor",
    name: "Padded armor",
    amount: 4,
    coin: "gp",
    encumbrance: "100 coin",
  },
  {
    category: "Armor",
    name: "Plate mail",
    amount: 400,
    coin: "gp",
    encumbrance: "450 coin",
  },
  {
    category: "Armor",
    name: "Ring mail",
    amount: 30,
    coin: "gp",
    encumbrance: "250 coin",
  },
  {
    category: "Armor",
    name: "Scale mail",
    amount: 45,
    coin: "gp",
    encumbrance: "400 coin",
  },
  {
    category: "Armor",
    name: "Shield, large",
    amount: 15,
    coin: "gp",
    encumbrance: "100 coin",
  },
  {
    category: "Armor",
    name: "Shield, small",
    amount: 10,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Armor",
    name: "Shield, small wooden",
    amount: 1,
    coin: "gp",
    encumbrance: "30 coin",
  },
  {
    category: "Armor",
    name: "Splint mail",
    amount: 80,
    coin: "gp",
    encumbrance: "400 coin",
  },
  {
    category: "Armor",
    name: "Studded leather",
    amount: 15,
    coin: "gp",
    encumbrance: "200 coin",
  },
  {
    category: "Arms",
    name: "Arrow, normal (single)",
    amount: 2,
    coin: "sp",
    encumbrance: "2 coin",
  },
  {
    category: "Arms",
    name: "Arrows, normal (dozen)",
    amount: 1,
    coin: "gp",
    encumbrance: "24 coin",
  },
  {
    category: "Arms",
    name: "Arrow, silver (single)",
    amount: 1,
    coin: "gp",
    encumbrance: "2 coin",
  },
  {
    category: "Arms",
    name: "Axe, battle",
    amount: 5,
    coin: "gp",
    encumbrance: "75 coin",
  },
  {
    category: "Arms",
    name: "Axe, hand or throwing",
    amount: 1,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Arms",
    name: "Club",
    amount: 0,
    coin: "gp",
    encumbrance: "30 coin",
  },
  {
    category: "Arms",
    name: "Bardiche",
    amount: 7,
    coin: "gp",
    encumbrance: "125 coin",
  },
  {
    category: "Arms",
    name: "Bec de corbin",
    amount: 6,
    coin: "gp",
    encumbrance: "100 coin",
  },
  {
    category: "Arms",
    name: "Bill-guisarme",
    amount: 6,
    coin: "gp",
    encumbrance: "150 coin",
  },
  {
    category: "Arms",
    name: "Bow, composite short",
    amount: 75,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Arms",
    name: "Bow, composite long",
    amount: 100,
    coin: "gp",
    encumbrance: "80 coin",
  },
  {
    category: "Arms",
    name: "Bow, long",
    amount: 60,
    coin: "gp",
    encumbrance: "100 coin",
  },
  {
    category: "Arms",
    name: "Bow, short",
    amount: 15,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Arms",
    name: "Crossbow, heavy",
    amount: 20,
    coin: "gp",
    encumbrance: "80 coin",
  },
  {
    category: "Arms",
    name: "Crossbow, light",
    amount: 12,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Arms",
    name: "Dagger and scabbard",
    amount: 2,
    coin: "gp",
    encumbrance: "10 coin",
  },
  {
    category: "Arms",
    name: "Dart",
    amount: 5,
    coin: "sp",
    encumbrance: "5 coin",
  },
  {
    category: "Arms",
    name: "Fauchard",
    amount: 3,
    coin: "gp",
    encumbrance: "60 coin",
  },
  {
    category: "Arms",
    name: "Fauchard-fork",
    amount: 8,
    coin: "gp",
    encumbrance: "80 coin",
  },
  {
    category: "Arms",
    name: "Flail, footman’s",
    amount: 3,
    coin: "gp",
    encumbrance: "150 coin",
  },
  {
    category: "Arms",
    name: "Flail, horseman’s",
    amount: 8,
    coin: "gp",
    encumbrance: "35 coin",
  },
  {
    category: "Arms",
    name: "Fork, military",
    amount: 4,
    coin: "gp",
    encumbrance: "75 coin",
  },
  {
    category: "Arms",
    name: "Glaive",
    amount: 6,
    coin: "gp",
    encumbrance: "75 coin",
  },
  {
    category: "Arms",
    name: "Glaive-guisarme",
    amount: 10,
    coin: "gp",
    encumbrance: "100 coin",
  },
  {
    category: "Arms",
    name: "Guisarme",
    amount: 5,
    coin: "gp",
    encumbrance: "80 coin",
  },
  {
    category: "Arms",
    name: "Guisarme-voulge",
    amount: 7,
    coin: "gp",
    encumbrance: "150 coin",
  },
  {
    category: "Arms",
    name: "Halberd",
    amount: 9,
    coin: "gp",
    encumbrance: "175 coin",
  },
  {
    category: "Arms",
    name: "Hammer, lucern",
    amount: 7,
    coin: "gp",
    encumbrance: "150 coin",
  },
  {
    category: "Arms",
    name: "Hammer",
    amount: 1,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Arms",
    name: "Javelin",
    amount: 10,
    coin: "sp",
    encumbrance: "20 coin",
  },
  {
    category: "Arms",
    name: "Lance",
    amount: 6,
    coin: "gp",
    encumbrance: "50–150 coin",
  },
  {
    category: "Arms",
    name: "Mace, footman’s",
    amount: 8,
    coin: "gp",
    encumbrance: "100 coin",
  },
  {
    category: "Arms",
    name: "Mace, horseman’s",
    amount: 4,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Arms",
    name: "Morning star",
    amount: 5,
    coin: "gp",
    encumbrance: "125 coin",
  },
  {
    category: "Arms",
    name: "Partisan",
    amount: 10,
    coin: "gp",
    encumbrance: "80 coin",
  },
  {
    category: "Arms",
    name: "Pick, military, footman’s",
    amount: 8,
    coin: "gp",
    encumbrance: "60 coin",
  },
  {
    category: "Arms",
    name: "Pick, military, horseman’s",
    amount: 5,
    coin: "gp",
    encumbrance: "40 coin",
  },
  {
    category: "Arms",
    name: "Pike, awl",
    amount: 3,
    coin: "gp",
    encumbrance: "80 coin",
  },
  {
    category: "Arms",
    name: "Quarrel (bolt), light (single)",
    amount: 1,
    coin: "sp",
    encumbrance: "1 coin",
  },
  {
    category: "Arms",
    name: "Quarrels (bolts), heavy (score)",
    amount: 2,
    coin: "gp",
    encumbrance: "40 coin",
  },
  {
    category: "Arms",
    name: "Ranseur",
    amount: 4,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Arms",
    name: "Scimitar",
    amount: 15,
    coin: "gp",
    encumbrance: "40 coin",
  },
  {
    category: "Arms",
    name: "Sling and bullets (dozen)",
    amount: 15,
    coin: "sp",
    encumbrance: "24 coin",
  },
  {
    category: "Arms",
    name: "Sling bullets (score)",
    amount: 10,
    coin: "sp",
    encumbrance: "40 coin",
  },
  {
    category: "Arms",
    name: "Spear",
    amount: 1,
    coin: "gp",
    encumbrance: "40–60 coin",
  },
  {
    category: "Arms",
    name: "Spetum",
    amount: 3,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Arms",
    name: "Sword, bastard and scabbard",
    amount: 25,
    coin: "gp",
    encumbrance: "100 coin",
  },
  {
    category: "Arms",
    name: "Sword, broad and scabbard",
    amount: 10,
    coin: "gp",
    encumbrance: "75 coin",
  },
  {
    category: "Arms",
    name: "Sword, long and scabbard",
    amount: 15,
    coin: "gp",
    encumbrance: "60 coin",
  },
  {
    category: "Arms",
    name: "Sword, short and scabbard",
    amount: 8,
    coin: "gp",
    encumbrance: "35 coin",
  },
  {
    category: "Arms",
    name: "Sword, two-handed",
    amount: 30,
    coin: "gp",
    encumbrance: "250 coin",
  },
  {
    category: "Arms",
    name: "Trident",
    amount: 4,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Arms",
    name: "Voulge",
    amount: 2,
    coin: "gp",
    encumbrance: "125 coin",
  },
  {
    category: "Clothing",
    name: "Belt",
    amount: 3,
    coin: "sp",
    encumbrance: "3 coin",
  },
  {
    category: "Clothing",
    name: "Boots, high, hard",
    amount: 2,
    coin: "gp",
    encumbrance: "60 coin",
  },
  {
    category: "Clothing",
    name: "Boots, high, soft",
    amount: 1,
    coin: "gp",
    encumbrance: "30 coin",
  },
  {
    category: "Clothing",
    name: "Boots, low, hard",
    amount: 1,
    coin: "gp",
    encumbrance: "60 coin",
  },
  {
    category: "Clothing",
    name: "Boots, low, soft",
    amount: 8,
    coin: "sp",
    encumbrance: "30 coin",
  },
  {
    category: "Clothing",
    name: "Cap",
    amount: 1,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Clothing",
    name: "Cloak",
    amount: 5,
    coin: "sp",
    encumbrance: "25 coin worn / 50 coin folded",
  },
  {
    category: "Clothing",
    name: "Girdle, broad",
    amount: 2,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Clothing",
    name: "Girdle, normal",
    amount: 10,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Clothing",
    name: "Hat",
    amount: 7,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Clothing",
    name: "Robe",
    amount: 6,
    coin: "sp",
    encumbrance: "25 coin worn / 50 coin folded",
  },
  {
    category: "Herbs",
    name: "Belladonna, sprig",
    amount: 4,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Herbs",
    name: "Garlic, bud",
    amount: 5,
    coin: "cp",
    encumbrance: "—",
  },
  {
    category: "Herbs",
    name: "Wolfsbane, sprig",
    amount: 10,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Chicken",
    amount: 3,
    coin: "cp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Cow",
    amount: 10,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Dog, guard",
    amount: 25,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Dog, hunting",
    amount: 17,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Donkey",
    amount: 8,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Goat",
    amount: 1,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Hawk, large",
    amount: 40,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Hawk, small",
    amount: 18,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Horse, draft",
    amount: 30,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Horse, heavy war",
    amount: 300,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Horse, light war",
    amount: 150,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Horse, medium war",
    amount: 225,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Horse, riding (light)",
    amount: 25,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Mule",
    amount: 20,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Ox",
    amount: 15,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Pigeon",
    amount: 2,
    coin: "cp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Piglet",
    amount: 1,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Pig",
    amount: 3,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Pony",
    amount: 15,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Sheep",
    amount: 2,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Livestock",
    name: "Songbird",
    amount: 4,
    coin: "cp",
    encumbrance: "—",
  },
  {
    category: "Miscellaneous",
    name: "Backpack, leather",
    amount: 2,
    coin: "gp",
    encumbrance: "20 coin",
  },
  {
    category: "Miscellaneous",
    name: "Box, iron, large",
    amount: 28,
    coin: "gp",
    encumbrance: "1,000–5,000 coin",
  },
  {
    category: "Miscellaneous",
    name: "Box, iron, small",
    amount: 9,
    coin: "gp",
    encumbrance: "200–500 coin",
  },
  {
    category: "Miscellaneous",
    name: "Candle, tallow",
    amount: 1,
    coin: "cp",
    encumbrance: "5 coin",
  },
  {
    category: "Miscellaneous",
    name: "Candle, wax",
    amount: 1,
    coin: "sp",
    encumbrance: "5 coin",
  },
  {
    category: "Miscellaneous",
    name: "Case, bone, map or scroll",
    amount: 5,
    coin: "gp",
    encumbrance: "50 coin",
  },
  {
    category: "Miscellaneous",
    name: "Case, leather, map or scroll",
    amount: 15,
    coin: "sp",
    encumbrance: "25 coin",
  },
  {
    category: "Miscellaneous",
    name: "Chest, wooden, large",
    amount: 17,
    coin: "sp",
    encumbrance: "500–1,500 coin",
  },
  {
    category: "Miscellaneous",
    name: "Chest, wooden, small",
    amount: 8,
    coin: "sp",
    encumbrance: "100–250 coin",
  },
  {
    category: "Miscellaneous",
    name: "Lantern, bullseye",
    amount: 12,
    coin: "gp",
    encumbrance: "60 coin",
  },
  {
    category: "Miscellaneous",
    name: "Lantern, hooded",
    amount: 7,
    coin: "gp",
    encumbrance: "60 coin",
  },
  {
    category: "Miscellaneous",
    name: "Mirror, large metal",
    amount: 10,
    coin: "gp",
    encumbrance: "5 coin",
  },
  {
    category: "Miscellaneous",
    name: "Mirror, small, silver",
    amount: 20,
    coin: "gp",
    encumbrance: "5 coin",
  },
  {
    category: "Miscellaneous",
    name: "Oil, flask",
    amount: 1,
    coin: "gp",
    encumbrance: "20 coin",
  },
  {
    category: "Miscellaneous",
    name: "Pole, 10 feet",
    amount: 3,
    coin: "cp",
    encumbrance: "100 coin",
  },
  {
    category: "Miscellaneous",
    name: "Pouch, belt, large",
    amount: 1,
    coin: "gp",
    encumbrance: "10 coin",
  },
  {
    category: "Miscellaneous",
    name: "Pouch, belt, small",
    amount: 15,
    coin: "sp",
    encumbrance: "5 coin",
  },
  {
    category: "Miscellaneous",
    name: "Quiver, 1 dozen arrows",
    amount: 8,
    coin: "sp",
    encumbrance: "30 coin",
  },
  {
    category: "Miscellaneous",
    name: "Quiver, 1 score arrows",
    amount: 12,
    coin: "sp",
    encumbrance: "30 coin",
  },
  {
    category: "Miscellaneous",
    name: "Quiver, 1 score bolts",
    amount: 15,
    coin: "sp",
    encumbrance: "30 coin",
  },
  {
    category: "Miscellaneous",
    name: "Quiver, 2 score bolts",
    amount: 1,
    coin: "gp",
    encumbrance: "30 coin",
  },
  {
    category: "Miscellaneous",
    name: "Rope, 50 feet",
    amount: 4,
    coin: "sp",
    encumbrance: "75 coin",
  },
  {
    category: "Miscellaneous",
    name: "Sack, large",
    amount: 16,
    coin: "cp",
    encumbrance: "20 coin",
  },
  {
    category: "Miscellaneous",
    name: "Sack, small",
    amount: 10,
    coin: "cp",
    encumbrance: "5 coin",
  },
  {
    category: "Miscellaneous",
    name: "Skin for water or wine",
    amount: 15,
    coin: "sp",
    encumbrance: "5 coin empty / 50 coin full",
  },
  {
    category: "Miscellaneous",
    name: "Spike, iron, large",
    amount: 1,
    coin: "cp",
    encumbrance: "10 coin",
  },
  {
    category: "Miscellaneous",
    name: "Thieves’ picks and tools",
    amount: 30,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Miscellaneous",
    name: "Tinderbox with flint and steel",
    amount: 1,
    coin: "gp",
    encumbrance: "2 coin",
  },
  {
    category: "Miscellaneous",
    name: "Torch",
    amount: 1,
    coin: "cp",
    encumbrance: "25 coin",
  },
  {
    category: "Provisions",
    name: "Ale, pint",
    amount: 1,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Provisions",
    name: "Beer, small, pint",
    amount: 5,
    coin: "cp",
    encumbrance: "—",
  },
  {
    category: "Provisions",
    name: "Food, merchant’s meal",
    amount: 1,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Provisions",
    name: "Food, rich meal",
    amount: 1,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Provisions",
    name: "Grain, horse meal (1 day)",
    amount: 1,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Provisions",
    name: "Mead, pint",
    amount: 5,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Provisions",
    name: "Rations, iron (1 week)",
    amount: 5,
    coin: "gp",
    encumbrance: "75 coin",
  },
  {
    category: "Provisions",
    name: "Rations, standard (1 week)",
    amount: 3,
    coin: "gp",
    encumbrance: "200 coin",
  },
  {
    category: "Provisions",
    name: "Wine, pint, good",
    amount: 10,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Provisions",
    name: "Wine, pint, watered",
    amount: 5,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Tack and Harness",
    name: "Barding, chain",
    amount: 250,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Tack and Harness",
    name: "Barding, leather",
    amount: 100,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Tack and Harness",
    name: "Barding, plate",
    amount: 500,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Tack and Harness",
    name: "Bit and bridle",
    amount: 15,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Tack and Harness",
    name: "Harness",
    amount: 12,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Tack and Harness",
    name: "Saddle",
    amount: 10,
    coin: "gp",
    encumbrance: "250–500 coin",
  },
  {
    category: "Tack and Harness",
    name: "Saddle bags, large",
    amount: 4,
    coin: "gp",
    encumbrance: "150 coin",
  },
  {
    category: "Tack and Harness",
    name: "Saddle bags, small",
    amount: 3,
    coin: "gp",
    encumbrance: "150 coin",
  },
  {
    category: "Tack and Harness",
    name: "Saddle blanket",
    amount: 3,
    coin: "sp",
    encumbrance: "20 coin",
  },
  {
    category: "Religious",
    name: "Prayer beads",
    amount: 1,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Religious",
    name: "Incense, stick",
    amount: 1,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Religious",
    name: "Holy or unholy symbol, iron",
    amount: 2,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Religious",
    name: "Holy or unholy symbol, silver",
    amount: 50,
    coin: "gp",
    encumbrance: "—",
  },
  {
    category: "Religious",
    name: "Holy or unholy symbol, wooden",
    amount: 7,
    coin: "sp",
    encumbrance: "—",
  },
  {
    category: "Religious",
    name: "Holy or unholy water, vial",
    amount: 25,
    coin: "gp",
    encumbrance: "25 coin",
  },
];

export const RECRUIT_ARMOR_AC: Record<string, number> = {
  Unarmored: 10,
  "Leather armor": 8,
  "Padded armor": 8,
  "Studded leather": 7,
  "Ring mail": 7,
  "Scale mail": 6,
  "Chain mail": 5,
  "Splint mail": 4,
  "Banded mail": 4,
  "Plate mail": 3,
};

const RECRUIT_LIGHT_ARMOR = [
  "Unarmored",
  "Leather armor",
  "Padded armor",
  "Studded leather",
  "Ring mail",
];

const RECRUIT_MEDIUM_ARMOR = [
  ...RECRUIT_LIGHT_ARMOR,
  "Scale mail",
  "Chain mail",
];

const RECRUIT_HEAVY_ARMOR = [
  ...RECRUIT_MEDIUM_ARMOR,
  "Splint mail",
  "Banded mail",
  "Plate mail",
];

export const RECRUIT_SHIELDS = [
  "Shield, large",
  "Shield, small",
  "Shield, small wooden",
];

const RECRUIT_SHORTBOWS = ["Bow, short", "Bow, composite short"];

const RECRUIT_LONGBOWS = ["Bow, long", "Bow, composite long"];

const RECRUIT_CROSSBOWS = ["Crossbow, light", "Crossbow, heavy"];

const RECRUIT_PIKEMAN_WEAPONS = ["Pike, awl", "Spear"].map(String);

const RECRUIT_AMMO = [
  "Arrow, normal (single)",
  "Arrows, normal (dozen)",
  "Arrow, silver (single)",
  "Quarrel (bolt), light (single)",
  "Quarrels (bolts), heavy (score)",
  "Sling bullets (score)",
];

const RECRUIT_MISSILE_ONLY = [
  ...RECRUIT_SHORTBOWS,
  ...RECRUIT_LONGBOWS,
  ...RECRUIT_CROSSBOWS,
  "Sling and bullets (dozen)",
  "Dart",
];

const RECRUIT_LIGHT_HORSE_THROWING_WEAPONS = [
  "Axe, hand or throwing",
  "Javelin",
  "Dart",
];

const RECRUIT_WEAPON_ITEMS = equipmentCatalog.filter(
  (item) => item.category === "Arms" && !RECRUIT_AMMO.includes(item.name),
);

const RECRUIT_MELEE_WEAPONS = RECRUIT_WEAPON_ITEMS.filter(
  (item) => !RECRUIT_MISSILE_ONLY.includes(item.name),
).map((item) => item.name);

type RecruitEquipmentRules = {
  armor: string[];
  weaponMode: "melee" | "shortbow" | "longbow" | "crossbow" | "other";
  shieldAllowed: boolean;
  requireMelee: boolean;
  requiredMissileWeapons?: string[];
  additionalWeapons?: string[];
};

export function recruitEquipmentRules(value: string): RecruitEquipmentRules {
  const type = value.trim().toLowerCase();

  if (type === "archer (shortbow)" || type === "horseman, archer") {
    return {
      armor: RECRUIT_LIGHT_ARMOR,
      weaponMode: "shortbow",
      shieldAllowed: false,
      requireMelee: true,
      requiredMissileWeapons: RECRUIT_SHORTBOWS,
    };
  }
  if (type === "archer (longbow)") {
    return {
      armor: RECRUIT_LIGHT_ARMOR,
      weaponMode: "longbow",
      shieldAllowed: false,
      requireMelee: true,
      requiredMissileWeapons: RECRUIT_LONGBOWS,
    };
  }
  if (type === "crossbowman" || type === "horseman, crossbowman") {
    return {
      armor: RECRUIT_LIGHT_ARMOR,
      weaponMode: "crossbow",
      shieldAllowed: false,
      requireMelee: true,
      requiredMissileWeapons: RECRUIT_CROSSBOWS,
    };
  }
  if (["footman, heavy", "hobilar, heavy", "horseman, heavy"].includes(type)) {
    return {
      armor: RECRUIT_HEAVY_ARMOR,
      weaponMode: "melee",
      shieldAllowed: true,
      requireMelee: true,
    };
  }
  if (type === "horseman, medium") {
    return {
      armor: RECRUIT_MEDIUM_ARMOR,
      weaponMode: "melee",
      shieldAllowed: true,
      requireMelee: true,
    };
  }
  if (type === "footman, pikeman") {
    return {
      armor: RECRUIT_LIGHT_ARMOR,
      weaponMode: "melee",
      shieldAllowed: true,
      requireMelee: true,
      requiredMissileWeapons: RECRUIT_PIKEMAN_WEAPONS,
    };
  }
  if (type === "horseman, light") {
    return {
      armor: RECRUIT_LIGHT_ARMOR,
      weaponMode: "melee",
      shieldAllowed: true,
      requireMelee: true,
      additionalWeapons: RECRUIT_LIGHT_HORSE_THROWING_WEAPONS,
    };
  }
  if (["footman, light", "hobilar, light"].includes(type)) {
    return {
      armor: RECRUIT_LIGHT_ARMOR,
      weaponMode: "melee",
      shieldAllowed: true,
      requireMelee: true,
    };
  }

  return {
    armor: RECRUIT_HEAVY_ARMOR,
    weaponMode: "other",
    shieldAllowed: true,
    requireMelee: false,
  };
}

export function recruitWeaponOptions(rules: RecruitEquipmentRules) {
  if (!rules.requiredMissileWeapons) return RECRUIT_WEAPON_ITEMS;
  return RECRUIT_WEAPON_ITEMS.filter(
    (item) =>
      rules.requiredMissileWeapons?.includes(item.name) ||
      rules.additionalWeapons?.includes(item.name) ||
      RECRUIT_MELEE_WEAPONS.includes(item.name),
  );
}

export function recruitGearValidation(
  rules: RecruitEquipmentRules,
  armor: string,
  weapons: string[],
  shield: string,
) {
  if (!rules.armor.includes(armor))
    return "Select armor permitted for this troop type.";
  if (weapons.length > 3)
    return "Recruits can carry no more than three weapons.";
  if (
    rules.requireMelee &&
    !weapons.some((name) => RECRUIT_MELEE_WEAPONS.includes(name))
  ) {
    return "These recruits must carry at least one melee weapon.";
  }
  if (
    rules.requiredMissileWeapons &&
    !weapons.some((name) => rules.requiredMissileWeapons?.includes(name))
  ) {
    if (rules.requiredMissileWeapons === RECRUIT_PIKEMAN_WEAPONS)
      return "Pikemen must carry a spear or pike.";
    if (rules.weaponMode === "shortbow")
      return "Shortbowmen must carry a shortbow.";
    if (rules.weaponMode === "longbow")
      return "Longbowmen must carry a longbow.";
    return "Crossbowmen must carry a light or heavy crossbow.";
  }
  if (shield && !rules.shieldAllowed)
    return "This troop type cannot carry a shield.";
  return "";
}

export function forceEditorArmorOptions(soldierType: string) {
  if (!soldierType) return FORCE_ARMOR_OPTIONS;
  const rules = recruitEquipmentRules(soldierType);
  const allowedAcs = new Set(
    rules.armor
      .map((armor) => RECRUIT_ARMOR_AC[armor])
      .filter((ac) => ac !== undefined),
  );
  return FORCE_ARMOR_OPTIONS.filter((option) => allowedAcs.has(option.ac));
}

export function forceEditorWeaponNames(soldierType: string) {
  if (!soldierType) return FORCE_WEAPON_OPTIONS.map((weapon) => weapon.name);
  const rules = recruitEquipmentRules(soldierType);

  if (rules.weaponMode === "other") {
    return FORCE_WEAPON_OPTIONS.map((weapon) => weapon.name);
  }

  const allowed = new Set<string>();
  RECRUIT_MELEE_WEAPONS.forEach((name) => allowed.add(name));
  (rules.requiredMissileWeapons || []).forEach((name) => allowed.add(name));
  (rules.additionalWeapons || []).forEach((name) => allowed.add(name));

  return Array.from(allowed);
}

export function forceEditorWeaponOptions(soldierType: string) {
  const allowedNames = new Set(forceEditorWeaponNames(soldierType));
  const allNames = [
    ...FORCE_WEAPON_OPTIONS.map((weapon) => weapon.name),
    ...RECRUIT_WEAPON_ITEMS.map((weapon) => weapon.name),
  ];
  return Array.from(new Set(allNames))
    .filter((name) => allowedNames.has(name))
    .map(
      (name) =>
        FORCE_WEAPON_OPTIONS.find((weapon) => weapon.name === name) || {
          name,
          damageSmallMedium: "",
          damageLarge: "",
        },
    );
}

export function forceEditorGearValidation(
  soldierType: string,
  armor: string,
  shield: boolean,
  weaponNames: string[],
) {
  if (!soldierType) return "";
  const rules = recruitEquipmentRules(soldierType);

  // Legacy/unknown troop types remain editable without imposing recruitment
  // restrictions that were never defined for them.
  if (rules.weaponMode === "other")
    return weaponNames.length > 3
      ? "A soldier group can carry no more than three weapons."
      : "";

  const allowedArmorNames = new Set<string>(
    forceEditorArmorOptions(soldierType).map((option) => String(option.name)),
  );
  if (!allowedArmorNames.has(armor))
    return "Select armor permitted for this troop type.";
  if (shield && !rules.shieldAllowed)
    return "This troop type cannot carry a shield.";
  if (weaponNames.length > 3)
    return "A soldier group can carry no more than three weapons.";

  const allowedWeapons = new Set(forceEditorWeaponNames(soldierType));
  if (weaponNames.some((name) => !allowedWeapons.has(name))) {
    return "Remove weapons that are not permitted for this troop type.";
  }

  if (
    rules.requireMelee &&
    !weaponNames.some((name) => RECRUIT_MELEE_WEAPONS.includes(name))
  ) {
    return "This troop type must carry at least one melee weapon.";
  }

  if (
    rules.requiredMissileWeapons &&
    !weaponNames.some((name) => rules.requiredMissileWeapons?.includes(name))
  ) {
    if (rules.requiredMissileWeapons === RECRUIT_PIKEMAN_WEAPONS)
      return "Pikemen must carry a spear or pike.";
    if (rules.weaponMode === "shortbow")
      return "Shortbowmen must carry a shortbow.";
    if (rules.weaponMode === "longbow")
      return "Longbowmen must carry a longbow.";
    return "Crossbowmen must carry a light or heavy crossbow.";
  }

  return "";
}
