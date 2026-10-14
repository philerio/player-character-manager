import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    env: {
      VITE_DEMO_MODE: "true",
      VITE_APPS_SCRIPT_URL: "https://live.example.invalid/sheets",
    },
  },
});
