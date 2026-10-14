import { appStorage } from "./storage";

import { getSessionToken, type SheetRetainer } from "../google-sheets-api";

export type RetainerLocalDraft = {
  characterId: string;
  baseRetainers: SheetRetainer[];
  retainers: SheetRetainer[];
  updatedAt: string;
};

const RETAINER_DRAFT_PREFIX = "pcm-retainer-draft:";

function retainerDraftKey(characterId: string) {
  return `${RETAINER_DRAFT_PREFIX}${getSessionToken() || "anonymous"}:${characterId}`;
}

export function loadRetainerDraft(
  characterId: string,
): RetainerLocalDraft | null {
  if (!characterId || typeof window === "undefined") return null;
  try {
    const raw = appStorage.getItem(retainerDraftKey(characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RetainerLocalDraft;
    if (
      parsed.characterId !== characterId ||
      !Array.isArray(parsed.retainers) ||
      !Array.isArray(parsed.baseRetainers)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveRetainerDraft(draft: RetainerLocalDraft) {
  if (typeof window === "undefined") return;
  appStorage.setItem(
    retainerDraftKey(draft.characterId),
    JSON.stringify(draft),
  );
}

export function clearRetainerDraft(characterId: string) {
  if (!characterId || typeof window === "undefined") return;
  appStorage.removeItem(retainerDraftKey(characterId));
}

function retainerComparable(retainer: SheetRetainer) {
  return {
    name: retainer.name,
    type: retainer.type,
    role: retainer.role,
    level: retainer.level || "",
    wageGp: Number(retainer.wageGp) || 0,
    costCoin: retainer.costCoin || "gp",
    wageFrequency: retainer.wageFrequency || "monthly",
    hiringDate: retainer.hiringDate || "",
    men: Number(retainer.men) || 0,
    roster: retainer.roster || [],
    status: retainer.status || "",
    clericFightingForce: Boolean(retainer.clericFightingForce),
  };
}

export function retainerChanged(left: SheetRetainer, right: SheetRetainer) {
  return (
    JSON.stringify(retainerComparable(left)) !==
    JSON.stringify(retainerComparable(right))
  );
}

export function retainerMutationInput(retainer: SheetRetainer) {
  const level: number | "" =
    retainer.level === "" ||
    retainer.level === undefined ||
    retainer.level === null
      ? ""
      : Number(retainer.level) || "";

  const men: number | "" =
    retainer.type === "force" ? Number(retainer.men) || 0 : "";

  return {
    type: retainer.type,
    name: retainer.name,
    role: retainer.role || "",
    level,
    amount: Number(retainer.wageGp) || 0,
    costCoin: retainer.costCoin || "gp",
    wageFrequency: retainer.wageFrequency || "monthly",
    hiringDate: retainer.hiringDate || undefined,
    men,
    roster: retainer.type === "force" ? retainer.roster || [] : undefined,
    clericFightingForce:
      retainer.type === "force"
        ? Boolean(retainer.clericFightingForce)
        : undefined,
  };
}
