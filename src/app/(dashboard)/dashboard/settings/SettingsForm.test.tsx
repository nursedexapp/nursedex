// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const softDeleteAccount = vi.fn();
vi.mock("@/lib/profile/actions", () => ({
  softDeleteAccount: () => softDeleteAccount(),
}));

import { SettingsForm } from "./SettingsForm";
import { STALL_MS } from "@/components/ui/pending-button";

// Phase 2 of #443.
//
// Settings holds three async buttons and they do NOT all get the same mode.
// Saving contact preferences and changing a password are upserts, safe to fire
// twice: `retry`. Deleting an account cancels the user's Stripe subscriptions
// on the way out, so it is `wait`: on a stall the button stays dead rather than
// handing back a control that hits Stripe a second time.
//
// WHO OWNS THE MESSAGE (the question #656 asks): the toast owns "it failed",
// the inline stall owns "it never answered". They cannot coincide, because the
// stall alert only exists while the action is pending and the toast is only
// raised once it returns.

beforeEach(() => {
  vi.useFakeTimers();
  toastError.mockReset();
  toastSuccess.mockReset();
  softDeleteAccount.mockReset();
});

// A hung action has to be released before the next test starts. React entangles
// concurrent async actions through state shared across the module, so one left
// in flight keeps the NEXT test's action from ever settling: isPending stays
// true forever and the stall message never clears. Each test passes alone and
// the file fails, which is exactly the kind of silent trap worth naming. hang()
// is the only way this file is allowed to hang a promise.
const hung: Array<(value: unknown) => void> = [];

function hang<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    hung.push(resolve as (value: unknown) => void);
  });
}

afterEach(async () => {
  await act(async () => {
    hung.splice(0).forEach((resolve) => resolve({}));
    await vi.advanceTimersByTimeAsync(0);
  });
  cleanup();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setup(
  overrides: Partial<React.ComponentProps<typeof SettingsForm>> = {},
) {
  const onUpdateMarketing = vi.fn().mockResolvedValue({});
  const onChangePassword = vi.fn().mockResolvedValue({ success: "Updated" });
  const onSaveContact = vi.fn().mockResolvedValue({ success: true });

  const { container } = render(
    <SettingsForm
      marketingOptOut={false}
      onUpdateMarketing={onUpdateMarketing}
      onChangePassword={onChangePassword}
      familyContact={{
        zip_code: "11779",
        communication_preference: "email",
        phone: null,
      }}
      onSaveContact={onSaveContact}
      {...overrides}
    />,
  );

  const forms = container.querySelectorAll("form");
  const submit = async (form: Element) => {
    await act(async () => {
      fireEvent.submit(form);
      await vi.advanceTimersByTimeAsync(0);
    });
  };

  return {
    onChangePassword,
    onSaveContact,
    saveContact: () => submit(forms[0]),
    changePassword: () => submit(forms[1]),
  };
}

describe("saving contact preferences", () => {
  it("hands back a retry when the save stalls", async () => {
    const onSaveContact = vi.fn().mockReturnValue(hang());
    const { saveContact } = setup({ onSaveContact });

    await saveContact();
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/try again/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
  });

  it("lets the toast own a failure that arrives after the stall", async () => {
    let settle: (result: { error: string }) => void = () => {};
    const onSaveContact = vi
      .fn()
      .mockReturnValue(new Promise((resolve) => (settle = resolve)));
    const { saveContact } = setup({ onSaveContact });

    await saveContact();
    await advance(STALL_MS);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await act(async () => {
      settle({ error: "Could not save your preferences" });
    });
    // useActionState has to settle the action and end its transition before
    // isPending drops and the phase effect re-runs. That is a scheduler tick,
    // not a delay anyone sees.
    await advance(20);

    // The stall message is gone the moment there is a real answer to give.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("Could not save your preferences");
  });
});

describe("changing a password", () => {
  it("shows the change is running instead of looking like a dead click", async () => {
    const onChangePassword = vi.fn().mockReturnValue(hang());
    const { changePassword } = setup({ onChangePassword });

    await changePassword();

    expect(screen.getByRole("button", { name: /updating/i })).toBeDisabled();
  });

  it("hands back a retry when the change stalls", async () => {
    const onChangePassword = vi.fn().mockReturnValue(hang());
    const { changePassword } = setup({ onChangePassword });

    await changePassword();
    await advance(STALL_MS);

    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
  });
});

describe("deleting an account never hands back a live button", () => {
  async function openDeleteDialog() {
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Delete my account" }),
      );
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Type DELETE to confirm"), {
        target: { value: "DELETE" },
      });
    });
  }

  it("stays disabled on a stall and tells the user how to check", async () => {
    // softDeleteAccount cancels Stripe subscriptions before it deletes (#413).
    // Re-firing it is a side effect, not a retry, so this is `wait` mode: the
    // user is told what is happening and given nothing to click.
    softDeleteAccount.mockReturnValue(hang());
    setup();
    await openDeleteDialog();

    const del = screen.getByRole("button", { name: "Delete account" });
    await act(async () => {
      fireEvent.click(del);
    });
    await advance(STALL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: /deleting|delete account/i }),
    ).toBeDisabled();
    expect(softDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it("cannot be fired a second time by clicking through the stall message", async () => {
    softDeleteAccount.mockReturnValue(hang());
    setup();
    await openDeleteDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    });
    await advance(STALL_MS);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /deleting|delete account/i }),
      );
    });

    expect(softDeleteAccount).toHaveBeenCalledTimes(1);
  });
});
