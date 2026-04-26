import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Default to `node` — no tests in this project need a DOM. If a future
    // component test needs jsdom, add `// @vitest-environment jsdom` at the
    // top of that file. (jsdom + vitest 4.1.4 currently hangs the worker
    // pool — see memory feedback_vitest_jsdom.)
    environment: "node",
    setupFiles: [],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/lib/__tests__/**"],
    pool: "threads",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
