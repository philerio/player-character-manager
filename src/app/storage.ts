import { AppError } from "./errors";
import { apiBackend, apiUrl, demoRole, isDemoMode } from "./runtime";

const rescue = new Map<string, string>();
let failure = false;
export function hasStorageFailure() {
  return failure;
}
function noteFailure() {
  if (!failure) {
    failure = true;
    announce();
  }
}
function announce() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("pcm-storage-status"));
}

const prefix = isDemoMode
  ? `pcm-demo:${demoRole}:`
  : apiBackend === "d1"
    ? `pcm-d1:${encodeURIComponent(apiUrl)}:`
    : "";

/** Each view keeps its own drafts/cache; the demo campaign acts as their shared server. */
function scopedStorage(
  scope: string,
): Storage & { setItemDurably(key: string, value: string): void } {
  function write(key: string, value: string, preserveInMemory: boolean) {
    try {
      window.localStorage.setItem(scope + key, value);
      rescue.delete(scope + key);
    } catch {
      if (preserveInMemory) rescue.set(scope + key, value);
      noteFailure();
      throw new AppError(
        "storage",
        "Could not save on this device. Keep this tab open and download a backup before leaving.",
      );
    }
  }
  return {
    get length() {
      return keys(scope).length;
    },
    key(index) {
      return keys(scope)[index] ?? null;
    },
    getItem(key) {
      try {
        return (
          rescue.get(scope + key) ?? window.localStorage.getItem(scope + key)
        );
      } catch {
        noteFailure();
        return rescue.get(scope + key) ?? null;
      }
    },
    setItem(key, value) {
      write(key, value, true);
    },
    setItemDurably(key, value) {
      // Restore/import must leave the old working copy intact if persistence fails.
      write(key, value, false);
    },
    removeItem(key) {
      window.localStorage.removeItem(scope + key);
      rescue.delete(scope + key);
    },
    clear() {
      for (const key of keys(scope)) this.removeItem(key);
      failure = rescue.size > 0;
      announce();
    },
  };
}
export const appStorage = scopedStorage(prefix);
export const demoCampaignStorage = scopedStorage("pcm-demo:campaign:");
function keys(scope = prefix) {
  const belongs = (key: string) =>
    scope
      ? key.startsWith(scope)
      : !key.startsWith("pcm-demo:") && !key.startsWith("pcm-d1:");
  const result = new Set<string>();
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key !== null && belongs(key)) result.add(key.slice(scope.length));
    }
  } catch {
    noteFailure();
  }
  for (const key of rescue.keys())
    if (belongs(key)) result.add(key.slice(scope.length));
  return [...result];
}
export function resetDemo() {
  if (!isDemoMode) return;
  // Both role caches/drafts must reset alongside their shared campaign.
  scopedStorage("pcm-demo:").clear();
  window.location.reload();
}
export function retryStorage() {
  for (const [key, value] of rescue) {
    window.localStorage.setItem(key, value);
    rescue.delete(key);
  }
  failure = false;
  announce();
}
export function downloadWorkingCopy() {
  const records = keys()
    .filter((key) =>
      /^pcm-(local-wallet|retainer-draft|territory-draft|journal-draft|bootstrap-cache)/.test(
        key,
      ),
    )
    .map((key) => {
      const value = appStorage.getItem(key);
      let data: unknown;
      try {
        data = JSON.parse(value || "null");
      } catch {
        data = value;
      }
      return {
        kind: key.split(":")[0],
        memoryOnly: rescue.has(prefix + key),
        data,
      };
    });
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), records },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "campaign-working-copy.json";
  link.click();
  URL.revokeObjectURL(url);
}
