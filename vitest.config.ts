import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Outside node_modules on purpose (#811), so it survives `npm ci` and can be
  // restored by actions/cache.
  //
  // What is actually in here, measured rather than assumed: ONE file,
  // vitest/<hash>/results.json, about 24KB, which is the store vitest uses to
  // order test files slowest first. There is no transform cache on disk. The
  // issue asked for "a vitest transform cache" and the first version of this
  // comment claimed to be caching one; a full run writes nothing of the kind.
  // A comment that misdescribes why something works is worse than no comment,
  // because it is the explanation the next person reasons from.
  //
  // The saving is real even so: measured over six CI runs on one unchanged
  // tree, alternating a deleted and a restored cache, the vitest step was
  // 112, 112, 114 seconds cold against 96, 110, 95 warm. About 12 to 17
  // seconds most runs. Re-measure the same way before changing this, because
  // comparing across branches cannot answer it: each branch runs a different
  // amount of work.
  //
  // It also suits the guard mutation lanes (#807): each lane is an rsync copy
  // of the working tree, so each gets its own copy of this directory rather
  // than several writing to one shared cache.
  cacheDir: ".vitest-cache",
  test: {
    // Default to `node` — most tests need no DOM. For a test that does (e.g.
    // the Tiptap editor specs), add `// @vitest-environment happy-dom` at the
    // top of that file. Use happy-dom, not jsdom: jsdom + vitest 4.1.4 hangs
    // the worker pool in this repo (see memory feedback_vitest_jsdom).
    environment: "node",
    setupFiles: [],
    // scripts/ holds CI-only tooling (e.g. the migration drift detector). It
    // lives outside src/ so it never enters the app bundle, but it still has
    // logic worth testing.
    include: [
      "src/**/*.test.{ts,tsx}",
      "test/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
      // eslint-rules/ holds custom lint rules loaded by eslint.config.mjs.
      // They are .mjs because tsconfig includes **/*.ts repo-wide, so a .ts
      // test importing an untyped rule module would fail `tsc --noEmit`.
      "eslint-rules/**/*.test.mjs",
    ],
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
