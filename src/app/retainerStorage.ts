import { appStorage } from "./storage";

import {
  getDraftScope,
  getSessionToken,
  type SheetRetainer,
} from "../google-sheets-api";

export type RetainerLocalDraft = {
  characterId: string;
  baseRetainers: SheetRetainer[];
  retainers: SheetRetainer[];
  creating?: { localId: string; mutationId: string };
  updatedAt: string;
};

const RETAINER_DRAFT_PREFIX = "pcm-retainer-draft:";

function retainerDraftKey(characterId: string) {
  return `${RETAINER_DRAFT_PREFIX}${getDraftScope()}:${characterId}`;
}

export function loadRetainerDraft(
  characterId: string,
): RetainerLocalDraft | null {
  if (!characterId || typeof window === "undefined") return null;
  try {
    const raw =
      appStorage.getItem(retainerDraftKey(characterId)) ||
      appStorage.getItem(
        `${RETAINER_DRAFT_PREFIX}${getSessionToken() || "anonymous"}:${characterId}`,
      );
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
  appStorage.removeItem(
    `${RETAINER_DRAFT_PREFIX}${getSessionToken() || "anonymous"}:${characterId}`,
  );
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

/** Acknowledge only the submitted version; preserve concurrent edits or deletion. */
export function acknowledgeRetainer(
  characterId: string,
  sent: SheetRetainer,
  remote: SheetRetainer,
) {
  const latest = loadRetainerDraft(characterId);
  if (!latest)
    throw new Error(
      "The working draft disappeared during synchronization. Refresh before continuing.",
    );
  const current = latest.retainers.find(
    (row) => row.retainerId === sent.retainerId,
  );
  const retainers = latest.retainers.map((row) =>
    row.retainerId !== sent.retainerId
      ? row
      : retainerChanged(row, sent)
        ? {
            ...row,
            retainerId: remote.retainerId,
            scheduleId: remote.scheduleId,
          }
        : remote,
  );
  const baseRetainers = [
    ...latest.baseRetainers.filter(
      (row) =>
        row.retainerId !== sent.retainerId &&
        row.retainerId !== remote.retainerId,
    ),
    remote,
  ];
  const next = {
    ...latest,
    baseRetainers,
    retainers,
    creating:
      latest.creating?.localId === sent.retainerId
        ? undefined
        : latest.creating,
    updatedAt: new Date().toISOString(),
  };
  saveRetainerDraft(next);
  return next;
}
export function acknowledgeRetainerDelete(
  characterId: string,
  retainerId: string,
) {
  const latest = loadRetainerDraft(characterId);
  if (!latest)
    throw new Error("The working draft disappeared during synchronization.");
  const next = {
    ...latest,
    baseRetainers: latest.baseRetainers.filter(
      (row) => row.retainerId !== retainerId,
    ),
    retainers: latest.retainers.map((row) =>
      row.retainerId === retainerId
        ? { ...row, retainerId: `local-${crypto.randomUUID()}` }
        : row,
    ),
    updatedAt: new Date().toISOString(),
  };
  saveRetainerDraft(next);
  return next;
}
export function retainerDraftHasChanges(draft: RetainerLocalDraft) {
  if (draft.creating || draft.baseRetainers.length !== draft.retainers.length)
    return true;
  const base = new Map(draft.baseRetainers.map((row) => [row.retainerId, row]));
  return draft.retainers.some(
    (row) =>
      !base.has(row.retainerId) ||
      retainerChanged(row, base.get(row.retainerId)!),
  );
}
