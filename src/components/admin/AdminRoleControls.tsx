"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PendingButton } from "@/components/ui/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { promoteToAdmin, demoteAdmin } from "@/lib/admin/role-actions";

// wait, not retry (#443 phase 4). Granting and revoking admin access is the
// highest-privilege write in the app. See VerificationRowActions for why the
// #652 guard does not yet make these safe to retry (#669).
const STALLED =
  "This is still processing. Please do not close this page. Refresh to check whether it went through.";

export function PromoteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "super_admin">("admin");
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button stops the button, not the form.
    if (pending) return;
    startTransition(async () => {
      const result = await promoteToAdmin({ email, role });
      if (!result.success) {
        toast.error(
          result.error === "not_found"
            ? "No user found with that email."
            : result.error === "wrong_state"
              ? "User is suspended or removed."
              : "Could not promote. Please try again.",
        );
        return;
      }
      toast.success(`Granted ${role.replace("_", " ")} to ${email}`);
      setEmail("");
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-sage/20 flex flex-wrap items-end gap-2 rounded-lg border bg-white p-4"
    >
      <div className="min-w-[220px] flex-1">
        <Label htmlFor="promote_email" className="mb-1.5 block">
          User email
        </Label>
        <Input
          id="promote_email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          required
          disabled={pending}
        />
      </div>
      <div>
        <Label htmlFor="promote_role" className="mb-1.5 block">
          Role
        </Label>
        <select
          id="promote_role"
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "super_admin")}
          disabled={pending}
          className="border-input bg-background flex h-9 rounded-lg border px-3 text-sm"
        >
          <option value="admin">admin</option>
          <option value="super_admin">super_admin</option>
        </select>
      </div>
      <PendingButton
        pending={pending}
        mode="wait"
        type="submit"
        idleLabel="Grant role"
        workingLabel="Granting..."
        slowLabel="Still granting..."
        stalledMessage={STALLED}
        disabled={!email}
      />
    </form>
  );
}

interface DemoteButtonProps {
  userId: string;
  email: string;
  isSelf: boolean;
}

export function DemoteButton({ userId, email, isSelf }: DemoteButtonProps) {
  const [pending, startTransition] = useTransition();

  if (isSelf) {
    return <span className="text-muted-foreground text-xs">You</span>;
  }

  const handleDemote = () => {
    if (pending) return;
    if (
      !confirm(
        `Demote ${email}? They lose access to /admin and become a family role user.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await demoteAdmin({ user_id: userId });
      if (!result.success) {
        toast.error("Could not demote. Please try again.");
        return;
      }
      toast.success("Demoted");
    });
  };

  return (
    <PendingButton
      pending={pending}
      mode="wait"
      variant="outline"
      idleLabel="Demote"
      workingLabel="Demoting..."
      slowLabel="Still demoting..."
      stalledMessage={STALLED}
      onClick={handleDemote}
    />
  );
}
