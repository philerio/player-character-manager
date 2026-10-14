import { demoRole, isDemoMode } from "./runtime";

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
    return window.localStorage.getItem(prefix + key);
  },
  setItem(key, value) {
    window.localStorage.setItem(prefix + key, value);
  },
  removeItem(key) {
    window.localStorage.removeItem(prefix + key);
  },
  clear() {
    for (const key of keys()) this.removeItem(key);
  },
};
function keys() {
  const result: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (
      key !== null &&
      (prefix ? key.startsWith(prefix) : !key.startsWith("pcm-demo:"))
    )
      result.push(key.slice(prefix.length));
  }
  return result;
}
export function resetDemo() {
  if (!isDemoMode) return;
  appStorage.clear();
  window.location.reload();
}
