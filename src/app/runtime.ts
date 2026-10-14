/** Mode is fixed for a page load so requests and storage use the same scope. */
export const demoRole =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("demo") === "dm"
    ? "dm"
    : "player";
export const isDemoMode =
  import.meta.env.VITE_DEMO_MODE === "true" ||
  !import.meta.env.VITE_APPS_SCRIPT_URL?.trim() ||
  (typeof window !== "undefined" &&
    ["player", "dm"].includes(
      new URLSearchParams(window.location.search).get("demo") || "",
    ));
