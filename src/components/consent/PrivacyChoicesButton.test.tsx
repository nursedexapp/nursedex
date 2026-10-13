// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Footer } from "@/components/shared/Footer";
import { AppFooter } from "@/components/shared/AppFooter";
import { CONSENT_OPEN_EVENT } from "@/lib/consent/store";

afterEach(cleanup);

describe("Privacy choices in the footers", () => {
  it.each([
    ["the public footer", () => <Footer year={2026} />],
    ["the app footer", () => <AppFooter />],
  ])("%s reopens the cookie bar", (_name, footer) => {
    render(footer());
    let opened = 0;
    const onOpen = () => {
      opened += 1;
    };
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    fireEvent.click(screen.getByRole("button", { name: "Privacy choices" }));
    window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
    expect(opened).toBe(1);
  });
});
