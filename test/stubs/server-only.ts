// Test stub for the `server-only` package. The real package is a build-time
// guard that errors if a server module is pulled into a client bundle; it is
// not resolvable under vitest. Aliasing it here to a no-op lets server modules
// (e.g. src/lib/slack/client.ts) be imported and unit tested.
export {};
