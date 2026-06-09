import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Default to `node` — most tests need no DOM. For a test that does (e.g.
    // the Tiptap editor specs), add `// @vitest-environment happy-dom` at the
    // top of that file. Use happy-dom, not jsdom: jsdom + vitest 4.1.4 hangs
    // the worker pool in this repo (see memory feedback_vitest_jsdom).
    environment: "node",
    setupFiles: [],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/lib/__tests__/**"],
    pool: "threads",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` is a build-time guard that is not resolvable under
      // vitest; stub it so server modules can be unit tested.
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
    },
  },
});
