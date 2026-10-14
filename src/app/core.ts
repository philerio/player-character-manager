import { type SheetCharacter } from "../google-sheets-api";

export type Section =
  "wallet" | "territories" | "journal" | "retainers" | "player-management";

export type CoinType = "pp" | "gp" | "sp" | "cp";

export type CoinBalances = Record<CoinType, number>;

export const coinValueInCopper: CoinBalances = {
  pp: 1000,
  gp: 200,
  sp: 10,
  cp: 1,
};

export function hashId(value: string) {
  return value.split("").reduce((hash, character) => {
    return (hash * 31 + character.charCodeAt(0)) | 0;
  }, 0);
}

export function formatLedgerDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export function formatCalendarDate(value: string) {
  const calendarDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (calendarDate) {
    const [, year, month, day] = calendarDate;
    return `${month}/${day}/${year}`;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
}

export const CHARACTER_CLASSES = [
  "Cleric",
  "Druid",
  "Fighter",
  "Paladin",
  "Ranger",
  "Magic-User",
  "Illusionist",
  "Thief",
  "Assassin",
  "Monk",
  "Bard",
  "Other",
] as const;

export function canonicalCharacterClass(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
  if (normalized === "magic user" || normalized === "magic-user")
    return "Magic-User";
  return (
    CHARACTER_CLASSES.find(
      (className) => className.toLowerCase() === normalized,
    ) || "Other"
  );
}

export function domainTaxRateSp(
  character: Pick<SheetCharacter, "class" | "level"> | null | undefined,
) {
  if (!character) return 0;
  const className = canonicalCharacterClass(character.class);
  const level = Math.max(0, Math.floor(Number(character.level) || 0));
  if (className === "Fighter" && level >= 9) return 7;
  if (className === "Cleric" && level >= 9) return 9;
  if (
    (className === "Magic-User" || className === "Illusionist") &&
    level >= 12
  )
    return 5;
  return 0;
}

/** UI-only state; campaign records stay in the API contracts. */
export type AppModal =
  | "funds"
  | "expense"
  | "purchase"
  | "character"
  | "edit-character"
  | "delete-character"
  | "ledger"
  | "journal-entry"
  | "recurring-expenses"
  | "retainer"
  | "territory"
  | null;
export type DataStatus = "demo" | "loading" | "cached" | "connected" | "error";
