export const apiBackend =
  import.meta.env.VITE_API_BACKEND === "d1" ? "d1" : "sheets";
export const apiUrl =
  (apiBackend === "d1"
    ? import.meta.env.VITE_API_URL
    : import.meta.env.VITE_APPS_SCRIPT_URL
  )?.trim() || "";
/** Mode is fixed for a page load so requests and storage use the same scope. */
export const demoRole =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("demo") === "dm"
    ? "dm"
    : "player";
export const isDemoMode =
  import.meta.env.VITE_DEMO_MODE === "true" ||
  !apiUrl ||
  (typeof window !== "undefined" &&
    ["player", "dm"].includes(
      new URLSearchParams(window.location.search).get("demo") || "",
    ));
