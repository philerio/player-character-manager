import { AppError } from "./errors";
import { demoRole, isDemoMode } from "./runtime";

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

const prefix = isDemoMode ? `pcm-demo:${demoRole}:` : "";

/** Exposes only the current mode's keys, including during cache cleanup. */
export const appStorage: Storage = {
  get length() {
    return keys().length;
  },
  key(index) {
    return keys()[index] ?? null;
  },
  getItem(key) {
    try {
      return rescue.get(key) ?? window.localStorage.getItem(prefix + key);
    } catch {
      noteFailure();
      return rescue.get(key) ?? null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(prefix + key, value);
      rescue.delete(key);
    } catch {
      rescue.set(key, value);
      noteFailure();
      throw new AppError(
        "storage",
        "Could not save on this device. Keep this tab open and download a backup before leaving.",
      );
    }
  },
  removeItem(key) {
    window.localStorage.removeItem(prefix + key);
    rescue.delete(key);
  },
  clear() {
    for (const key of keys()) this.removeItem(key);
    rescue.clear();
    failure = false;
    announce();
  },
};
function keys() {
  const result: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (
        key !== null &&
        (prefix ? key.startsWith(prefix) : !key.startsWith("pcm-demo:"))
      )
        result.push(key.slice(prefix.length));
    }
  } catch {
    noteFailure();
    return [...rescue.keys()];
  }
  return result;
}
export function resetDemo() {
  if (!isDemoMode) return;
  appStorage.clear();
  window.location.reload();
}

export function retryStorage() {
  for (const [key, value] of rescue) {
    window.localStorage.setItem(prefix + key, value);
    rescue.delete(key);
  }
  failure = false;
  announce();
}
export function downloadWorkingCopy() {
  const records = [...new Set([...keys(), ...rescue.keys()])]
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
      return { kind: key.split(":")[0], memoryOnly: rescue.has(key), data };
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
