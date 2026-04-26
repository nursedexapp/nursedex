"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  onChangePassword,
  familyContact,
  onSaveContact,
}: SettingsFormProps) {
  const [marketingOptOut, setMarketingOptOut] = useState(initialOptOut);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [commPref, setCommPref] = useState<CommunicationPreference | null>(
    (familyContact?.communication_preference as CommunicationPreference | null) ??
      null,
  );
  const [contactErrors, setContactErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [savingContact, setSavingContact] = useState(false);

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

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    await softDeleteAccount();
    // softDeleteAccount redirects, so we won't reach here
  };

  const handleSaveContact = async (formData: FormData) => {
    if (!onSaveContact) return;
    setSavingContact(true);
    setContactErrors({});
    formData.set("communication_preference", commPref ?? "");
    const result = await onSaveContact(formData);
    if (result.error) {
      toast.error(result.error);
    } else if (result.fieldErrors) {
      setContactErrors(result.fieldErrors);
    } else if (result.success) {
      toast.success("Contact preferences updated");
    }
    setSavingContact(false);
  };

  return (
    <div className="space-y-6">
      {/* Contact preferences (family only) */}
      {familyContact && onSaveContact && (
        <Card className="border-sage/20">
          <CardHeader>
            <CardTitle className="text-base">Contact preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleSaveContact} className="space-y-5">
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
                        onClick={() => setCommPref(pref)}
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
                    (optional)
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

              <Button type="submit" variant="outline" disabled={savingContact}>
                {savingContact ? "Saving..." : "Save changes"}
              </Button>
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

      {/* Change password */}
      <Card className="border-sage/20">
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              const result = await onChangePassword(formData);
              if (result.error) {
                toast.error(result.error);
              } else if (result.success) {
                toast.success(result.success);
              }
            }}
            className="space-y-4"
          >
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
            <Button type="submit" variant="outline">
              Update password
            </Button>
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
            This will hide your profile from search and sign you out. Your data
            will be retained for 30 days in case you change your mind.
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
              <div className="flex justify-end gap-2">
                <DialogClose className="hover:bg-muted inline-flex h-8 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors">
                  Cancel
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirm !== "DELETE" || deleting}
                >
                  {deleting ? "Deleting..." : "Delete account"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
