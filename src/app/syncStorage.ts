import { appStorage } from "./storage";

import {
  getSessionToken,
  type SheetTabSyncRevisions,
} from "../google-sheets-api";

const TAB_SYNC_REVISION_PREFIX = "pcm-tab-sync-revisions:v1:";

const EMPTY_TAB_SYNC_REVISIONS: SheetTabSyncRevisions = {
  wallet: 0,
  journal: 0,
  retainers: 0,
  territories: 0,
};

function tabSyncRevisionStorageKey(characterId: string) {
  return `${TAB_SYNC_REVISION_PREFIX}${getSessionToken() || "guest"}:${characterId}`;
}

export function loadAcceptedTabSyncRevisions(
  characterId: string,
): SheetTabSyncRevisions {
  if (!characterId || typeof window === "undefined")
    return { ...EMPTY_TAB_SYNC_REVISIONS };
  try {
    const raw = appStorage.getItem(tabSyncRevisionStorageKey(characterId));
    if (!raw) return { ...EMPTY_TAB_SYNC_REVISIONS };
    const parsed = JSON.parse(raw) as Partial<SheetTabSyncRevisions>;
    return {
      wallet: Math.max(0, Number(parsed.wallet) || 0),
      journal: Math.max(0, Number(parsed.journal) || 0),
      retainers: Math.max(0, Number(parsed.retainers) || 0),
      territories: Math.max(0, Number(parsed.territories) || 0),
    };
  } catch {
    return { ...EMPTY_TAB_SYNC_REVISIONS };
  }
}

export function saveAcceptedTabSyncRevisions(
  characterId: string,
  revisions: SheetTabSyncRevisions,
) {
  if (!characterId || typeof window === "undefined") return;
  try {
    appStorage.setItem(
      tabSyncRevisionStorageKey(characterId),
      JSON.stringify(revisions),
    );
  } catch {
    // Revision tracking must never stop the app from working.
  }
}
