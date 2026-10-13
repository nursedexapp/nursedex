import { describe, it, expect } from "vitest";
import { tracesSampleRateFor } from "./traces-sample-rate";

describe("tracesSampleRateFor", () => {
  it("samples a tenth of production", () => {
    expect(tracesSampleRateFor("production")).toBe(0.1);
  });

  it("samples everything elsewhere, where volume is low", () => {
    expect(tracesSampleRateFor("preview")).toBe(1);
    expect(tracesSampleRateFor("development")).toBe(1);
    expect(tracesSampleRateFor("")).toBe(1);
    expect(tracesSampleRateFor(undefined)).toBe(1);
  });
});
