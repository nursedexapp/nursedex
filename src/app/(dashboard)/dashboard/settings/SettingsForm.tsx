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

interface SettingsFormProps {
  marketingOptOut: boolean;
  onUpdateMarketing: (optOut: boolean) => Promise<{ error?: string }>;
  onChangePassword: (formData: FormData) => Promise<{ error?: string; success?: string }>;
}

export function SettingsForm({
  marketingOptOut: initialOptOut,
  onUpdateMarketing,
  onChangePassword,
}: SettingsFormProps) {
  const [marketingOptOut, setMarketingOptOut] = useState(initialOptOut);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

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

  return (
    <div className="space-y-6">
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
              <p className="text-xs text-muted-foreground">
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
          <CardTitle className="text-base text-destructive">
            Delete Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            This will hide your profile from search and sign you out. Your data
            will be retained for 30 days in case you change your mind.
          </p>
          <Dialog>
            <DialogTrigger className="inline-flex h-8 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20">
              Delete my account
            </DialogTrigger>
            <DialogContent>
              <DialogTitle className="text-lg font-semibold">
                Are you sure?
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                This will permanently remove your profile from NurseDex. Type
                DELETE below to confirm.
              </DialogDescription>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE to confirm"
              />
              <div className="flex justify-end gap-2">
                <DialogClose className="inline-flex h-8 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted">
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
