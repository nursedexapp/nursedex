"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { promoteToAdmin, demoteAdmin } from "@/lib/admin/role-actions";

export function PromoteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "super_admin">("admin");
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      className="flex flex-wrap items-end gap-2 rounded-lg border border-sage/20 bg-white p-4"
    >
      <div className="flex-1 min-w-[220px]">
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
          onChange={(e) =>
            setRole(e.target.value as "admin" | "super_admin")
          }
          disabled={pending}
          className="border-input bg-background flex h-9 rounded-lg border px-3 text-sm"
        >
          <option value="admin">admin</option>
          <option value="super_admin">super_admin</option>
        </select>
      </div>
      <Button type="submit" disabled={pending || !email}>
        {pending ? "Granting..." : "Grant role"}
      </Button>
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
    return (
      <span className="text-muted-foreground text-xs">You</span>
    );
  }

  const handleDemote = () => {
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
    <Button
      size="sm"
      variant="outline"
      onClick={handleDemote}
      disabled={pending}
    >
      Demote
    </Button>
  );
}
