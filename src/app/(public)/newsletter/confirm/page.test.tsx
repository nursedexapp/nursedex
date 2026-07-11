// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({
  confirmNewsletter: vi.fn(async (_token: string) => "confirmed" as string),
}));

vi.mock("@/lib/newsletter/actions", () => ({
  confirmNewsletter: h.confirmNewsletter,
}));

import NewsletterConfirmPage from "./page";

async function render(token?: string): Promise<string> {
  const el = await NewsletterConfirmPage({
    searchParams: Promise.resolve(token === undefined ? {} : { token }),
  });
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.confirmNewsletter.mockResolvedValue("confirmed");
});

describe("newsletter confirm page", () => {
  it("passes the token from searchParams to confirmNewsletter", async () => {
    await render("tok-123");
    expect(h.confirmNewsletter).toHaveBeenCalledWith("tok-123");
  });

  it("delegates an empty string when no token is present", async () => {
    await render(undefined);
    expect(h.confirmNewsletter).toHaveBeenCalledWith("");
  });

  it("renders the subscribed copy on a successful confirm", async () => {
    h.confirmNewsletter.mockResolvedValue("confirmed");
    const html = await render("tok-123");
    expect(html).toContain("You are subscribed");
  });

  it("renders the already-confirmed copy when the token was used before", async () => {
    h.confirmNewsletter.mockResolvedValue("already");
    const html = await render("tok-123");
    expect(html).toContain("Already confirmed");
  });

  it("renders the invalid copy for a bad or expired token", async () => {
    h.confirmNewsletter.mockResolvedValue("invalid");
    const html = await render("bad-token");
    expect(html).toContain("This link is not valid");
  });
});
