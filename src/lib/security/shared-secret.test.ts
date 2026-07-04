// @vitest-environment node
import { describe, it, expect } from "vitest";
import { verifyBearerSecret, verifySecretHeader } from "./shared-secret";

describe("verifyBearerSecret", () => {
  it("rejects when the secret env var is unset, even against the literal 'Bearer undefined' header", () => {
    expect(verifyBearerSecret("Bearer undefined", undefined)).toBe(false);
  });

  it("rejects a null header", () => {
    expect(verifyBearerSecret(null, "secret")).toBe(false);
  });

  it("accepts the correct bearer secret", () => {
    expect(verifyBearerSecret("Bearer secret", "secret")).toBe(true);
  });

  it("rejects an incorrect bearer secret of the same length", () => {
    expect(verifyBearerSecret("Bearer secreu", "secret")).toBe(false);
  });

  it("rejects an incorrect bearer secret of a different length", () => {
    expect(verifyBearerSecret("Bearer wrong", "secret")).toBe(false);
  });
});

describe("verifySecretHeader", () => {
  it("rejects when the secret env var is unset, even against the literal string 'undefined'", () => {
    expect(verifySecretHeader("undefined", undefined)).toBe(false);
  });

  it("rejects a null header", () => {
    expect(verifySecretHeader(null, "secret")).toBe(false);
  });

  it("accepts the correct secret", () => {
    expect(verifySecretHeader("secret", "secret")).toBe(true);
  });

  it("rejects an incorrect secret", () => {
    expect(verifySecretHeader("wrong", "secret")).toBe(false);
  });
});
