"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { PendingButton } from "@/components/ui/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { applyAnalyticsPreference } from "@/lib/analytics/preference";
import { softDeleteAccount } from "@/lib/profile/actions";
import { PASSWORD } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  CommunicationPreference,
  COMMUNICATION_PREFERENCE_LABELS,
} from "@/types/enums";
import type { UpdateContactResult } from "@/lib/family/actions";

interface FamilyContact {
  zip_code: string | null;
  communication_preference: string | null;
  phone: string | null;
}

interface SettingsFormProps {
  marketingOptOut: boolean;
  onUpdateMarketing: (optOut: boolean) => Promise<{ error?: string }>;
  analyticsOptOut: boolean;
  onUpdateAnalytics: (optOut: boolean) => Promise<{ error?: string }>;
  onChangePassword: (
    formData: FormData,
  ) => Promise<{ error?: string; success?: string }>;
  // Present only for family users.
  familyContact?: FamilyContact;
  onSaveContact?: (formData: FormData) => Promise<UpdateContactResult>;
}

export function SettingsForm({
  marketingOptOut: initialOptOut,
  onUpdateMarketing,
  analyticsOptOut: initialAnalyticsOptOut,
  onUpdateAnalytics,
  onChangePassword,
  familyContact,
  onSaveContact,
}: SettingsFormProps) {
  const [marketingOptOut, setMarketingOptOut] = useState(initialOptOut);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [analyticsOptOut, setAnalyticsOptOut] = useState(
    initialAnalyticsOptOut,
  );
  const [savingAnalytics, setSavingAnalytics] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [commPref, setCommPref] = useState<CommunicationPreference | null>(
    (familyContact?.communication_preference as CommunicationPreference | null) ??
      null,
  );
  const [contactErrors, setContactErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [contactSaved, setContactSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const handleMarketingToggle = async (checked: boolean) => {
    setSavingMarketing(true);
    const optOut = !checked; // checked = wants marketing, so optOut is inverse
    const result = await onUpdateMarketing(optOut);
    if (result.error) {
      toast.error(result.error);
    } else {
      setMarketingOptOut(optOut);
      toast.success("Notification preferences updated");
    }
    setSavingMarketing(false);
  };

  const handleAnalyticsToggle = async (checked: boolean) => {
    setSavingAnalytics(true);
    const optOut = !checked; // checked = happy to be measured
    const result = await onUpdateAnalytics(optOut);
    if (result.error) {
      // Nothing else changes. Saying "you are no longer tracked" while the row
      // still says otherwise is the worst outcome available here: the next
      // device would track them and the screen would have promised it would
      // not.
      toast.error(result.error);
    } else {
      setAnalyticsOptOut(optOut);
      // The row records the choice for the NEXT device. This is what stops
      // THIS browser, events and session recording alike, and without it the
      // toggle would look right and do nothing where the person is sitting.
      applyAnalyticsPreference(optOut);
      toast.success(
        optOut ? "Analytics turned off" : "Analytics turned back on",
      );
    }
    setSavingAnalytics(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    // No catch. softDeleteAccount redirects on success (so we never come back
    // here), and a genuine failure throws, which Sentry sees. Swallowing it into
    // a "done" state would be the worse bug. If it hangs, the button is in wait
    // mode and tells the user to refresh and check, which is the honest answer:
    // this one cancels Stripe subscriptions on the way out (#413), so we must
    // never hand back a control that could fire it twice.
    await softDeleteAccount();
  };

  // Pending comes from useActionState, not a local flag. A flag set inside a
  // <form action> is set inside React's transition, where it is deferred and can
  // fail to commit while the action is in flight (#444, and the note on
  // PendingButton). isPending is the signal that is actually reliable here.
  //
  // Who owns the message on this surface (#656): the toast owns "the save came
  // back and failed", the button's stall alert owns "the save never came back".
  // The alert only exists while pending is true, and every toast below is raised
  // after the action returns, which clears pending in the same commit.
  const [, saveContactAction, savingContact] = useActionState(
    async (_prev: null, formData: FormData) => {
      if (!onSaveContact) return null;
      setContactErrors({});
      formData.set("communication_preference", commPref ?? "");
      const result = await onSaveContact(formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.fieldErrors) {
        setContactErrors(result.fieldErrors);
      } else if (result.success) {
        toast.success("Contact preferences updated");
        setContactSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setContactSaved(false), 2500);
      }
      return null;
    },
    null,
  );

  const [, changePasswordAction, changingPassword] = useActionState(
    async (_prev: null, formData: FormData) => {
      const result = await onChangePassword(formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.success);
      }
      return null;
    },
    null,
  );

  return (
    <div className="space-y-6">
      {/* Contact preferences (family only) */}
      {familyContact && onSaveContact && (
        <Card className="border-sage/20">
          <CardHeader>
            <CardTitle className="text-base">Contact preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={saveContactAction}
              onChange={() => contactSaved && setContactSaved(false)}
              className="space-y-5"
            >
              {/* Zip code */}
              <div className="space-y-2">
                <Label htmlFor="contact-zip">Your zip code</Label>
                <Input
                  id="contact-zip"
                  name="zip_code"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="11779"
                  defaultValue={familyContact.zip_code ?? ""}
                  className="max-w-[160px]"
                  required
                />
                {contactErrors.zip_code && (
                  <p className="text-destructive text-xs">
                    {contactErrors.zip_code}
                  </p>
                )}
              </div>

              {/* Communication preference */}
              <div className="space-y-2">
                <Label>Preferred contact method</Label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(CommunicationPreference).map((pref) => {
                    const selected = commPref === pref;
                    return (
                      <button
                        key={pref}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setCommPref(pref);
                          setContactSaved(false);
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-sm transition-colors",
                          selected
                            ? "border-teal bg-teal/5 text-soft-black"
                            : "border-input hover:bg-sage/10",
                        )}
                      >
                        {COMMUNICATION_PREFERENCE_LABELS[pref]}
                      </button>
                    );
                  })}
                </div>
                {contactErrors.communication_preference && (
                  <p className="text-destructive text-xs">
                    {contactErrors.communication_preference}
                  </p>
                )}
              </div>

              {/* Phone (optional) */}
              <div className="space-y-2">
                <Label htmlFor="contact-phone">
                  Phone number{" "}
                  <span className="text-soft-black-light font-normal">
                    {commPref === CommunicationPreference.PHONE ||
                    commPref === CommunicationPreference.TEXT
                      ? "(required for phone or text)"
                      : "(optional)"}
                  </span>
                </Label>
                <Input
                  id="contact-phone"
                  name="phone"
                  type="tel"
                  placeholder="(631) 555-0142"
                  defaultValue={familyContact.phone ?? ""}
                />
                {contactErrors.phone && (
                  <p className="text-destructive text-xs">
                    {contactErrors.phone}
                  </p>
                )}
              </div>

              {/* Saving contact preferences is an upsert, so a stalled save is
                  safe to fire again: retry mode (#443 phase 2). The retry is the
                  form's own submit. */}
              <PendingButton
                pending={savingContact}
                mode="retry"
                type="submit"
                variant="outline"
                idleLabel={contactSaved ? "Saved" : "Save changes"}
                workingLabel="Saving..."
                slowLabel="Still saving..."
                icon={
                  contactSaved ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : undefined
                }
                className={cn(
                  contactSaved && "border-teal text-teal hover:text-teal",
                )}
              />
            </form>
          </CardContent>
        </Card>
      )}

      {/* Notifications */}
      <Card className="border-sage/20">
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3">
            <Checkbox
              checked={!marketingOptOut}
              onCheckedChange={(checked) =>
                handleMarketingToggle(checked as boolean)
              }
              disabled={savingMarketing}
            />
            <div>
              <p className="text-sm font-medium">Marketing emails</p>
              <p className="text-muted-foreground text-xs">
                Tips, feature updates, and promotional offers from NurseDex
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card className="border-sage/20">
        <CardHeader>
          <CardTitle className="text-base">Privacy</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3">
            <Checkbox
              checked={!analyticsOptOut}
              onCheckedChange={(checked) =>
                handleAnalyticsToggle(checked as boolean)
              }
              disabled={savingAnalytics}
              aria-label="Usage analytics"
            />
            <div>
              <p className="text-sm font-medium">Usage analytics</p>
              <p className="text-muted-foreground text-xs">
                Lets us measure how the site is used, and record a masked replay
                of your visit so we can see where things break. Turning this off
                stops both, on every device you sign in on.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card className="border-sage/20">
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={changePasswordAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={PASSWORD.MIN_LENGTH}
                required
                className="max-w-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                minLength={PASSWORD.MIN_LENGTH}
                required
                className="max-w-sm"
              />
            </div>
            {/* This one had no pending state at all: the click looked dead until
                the toast landed. Changing a password is idempotent, so a stalled
                one retries. */}
            <PendingButton
              pending={changingPassword}
              mode="retry"
              type="submit"
              variant="outline"
              idleLabel="Update password"
              workingLabel="Updating..."
              slowLabel="Still updating..."
            />
          </form>
        </CardContent>
      </Card>

      {/* Delete account */}
      <Card className="border-red-100">
        <CardHeader>
          <CardTitle className="text-destructive text-base">
            Delete Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-sm">
            This permanently deletes your account, removes your profile from
            NurseDex, and signs you out. This cannot be undone.
          </p>
          <Dialog>
            <DialogTrigger className="border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20 inline-flex h-8 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors">
              Delete my account
            </DialogTrigger>
            <DialogContent>
              <DialogTitle className="text-lg font-semibold">
                Are you sure?
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                This will permanently remove your profile from NurseDex. Type
                DELETE below to confirm.
              </DialogDescription>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE to confirm"
              />
              <div className="flex items-end justify-end gap-2">
                <DialogClose className="hover:bg-muted inline-flex h-8 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors">
                  Cancel
                </DialogClose>
                {/* wait, not retry. This cancels the user's Stripe subscriptions
                    before it deletes, so a second fire is a second side effect,
                    not a harmless repeat. On a stall the button stays dead and
                    the user is told how to check. */}
                <PendingButton
                  pending={deleting}
                  mode="wait"
                  variant="destructive"
                  idleLabel="Delete account"
                  workingLabel="Deleting..."
                  slowLabel="Still deleting..."
                  outcome="your account was deleted"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirm !== "DELETE"}
                />
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
