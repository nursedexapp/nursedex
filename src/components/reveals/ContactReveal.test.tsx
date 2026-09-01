// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// #831. The reveal's visible result used to depend entirely on router.refresh()
// bringing a fresh server render back, and that render can lose the race: in CI
// the row was written, the slot spent, the action returned 200 and the refresh
// fetched a new render 770ms later, and the page still showed the un-revealed
// state for the full fifteen seconds the e2e spec waited.
//
// The contact was in the browser the whole time. revealNurse returns it on
// success, and the button threw it away. These tests pin the fix: the contact
// the action hands back is what gets rendered, and the refresh is left to catch
// the REST of the page up rather than being the only path to the contact.
const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  posthog: { __loaded: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/reveals/actions", () => ({ revealNurse: vi.fn() }));
vi.mock("@/lib/subscriptions/actions", () => ({
  createFamilyAccessCheckout: vi.fn(),
  redirectToCheckout: vi.fn(),
}));
vi.mock("@/lib/posthog", () => ({
  posthog: {
    get __loaded() {
      return h.posthog.__loaded;
    },
    capture: vi.fn(),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ContactReveal } from "./ContactReveal";
import { revealNurse } from "@/lib/reveals/actions";

const CONTACT = {
  email: "nurse@example.com",
  phone: "555-0100",
  communication_preference: "email",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.posthog.__loaded = false;
});
afterEach(cleanup);

function renderSubscribed() {
  render(
    <ContactReveal
      nurseUserId="n1"
      nurseFirstName="Sam"
      returnTo="/nurses/sam"
      mode="subscribed"
      communicationPreference={null}
    />,
  );
}

async function clickReveal() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /reveal contact info/i }));
  });
}

describe("a reveal whose page never catches up", () => {
  it("shows the contact the action handed back", async () => {
    // router.refresh() is mocked to do nothing at all, which is exactly the
    // failing case: the server render never arrives with the reveal in it. The
    // contact must appear anyway.
    vi.mocked(revealNurse).mockResolvedValue({ success: true, contact: CONTACT });
    renderSubscribed();

    await clickReveal();

    expect(
      screen.getByRole("link", { name: /nurse@example.com/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reveal contact info/i }),
    ).toBeNull();
  });

  it("still asks the page to re-render, for everything else the reveal changes", async () => {
    // The contact no longer DEPENDS on the refresh, but the rest of the page
    // (identity, the reviews and hire controls a reveal unlocks) is still
    // server-rendered, so the request stays.
    vi.mocked(revealNurse).mockResolvedValue({ success: true, contact: CONTACT });
    renderSubscribed();

    await clickReveal();

    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("a reveal that does not succeed", () => {
  it("shows no contact and hands the button back when the reveal is refused", async () => {
    vi.mocked(revealNurse).mockResolvedValue({
      success: false,
      error: "rate_limited",
    });
    renderSubscribed();

    await clickReveal();

    expect(screen.queryByText(/nurse@example.com/)).toBeNull();
    expect(
      screen.getByRole("button", { name: /reveal contact info/i }),
    ).toBeEnabled();
  });

  it("shows no contact when the action rejects outright", async () => {
    vi.mocked(revealNurse).mockRejectedValue(new Error("boom"));
    renderSubscribed();

    await clickReveal();
    await act(async () => {});

    expect(screen.queryByText(/nurse@example.com/)).toBeNull();
    expect(
      screen.getByRole("button", { name: /reveal contact info/i }),
    ).toBeEnabled();
  });

  // revealNurse only reports success once it holds a contact, so this should
  // never arrive. If it ever does, the card must not replace the CTA with an
  // empty "Contact Information" heading and nothing under it: leave the page
  // re-render to say what the family has.
  it("keeps the CTA when a success carries no contact", async () => {
    vi.mocked(revealNurse).mockResolvedValue({ success: true });
    renderSubscribed();

    await clickReveal();

    expect(
      screen.getByRole("button", { name: /reveal contact info/i }),
    ).toBeInTheDocument();
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
});
