"use client";

import { useState } from "react";
import { selectRole } from "@/lib/auth/actions";
import { PendingButton } from "@/components/ui/pending-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Stethoscope } from "lucide-react";

type Role = "nurse" | "family";

export default function RoleSelectPage() {
  const [selected, setSelected] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!selected) return;
    setLoading(true);
    const formData = new FormData();
    formData.set("role", selected);
    await selectRole(formData);
    setLoading(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-heading text-2xl">How will you use NurseDex?</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          This helps us personalize your experience.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Account type"
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <RoleCard
          role="nurse"
          title="I am a nurse"
          description="Create a profile, get found by families, and grow your practice."
          icon={Stethoscope}
          selected={selected === "nurse"}
          disabled={loading}
          onSelect={() => setSelected("nurse")}
        />
        <RoleCard
          role="family"
          title="I need care"
          description="Find qualified nurses in your area and connect with them directly."
          icon={Heart}
          selected={selected === "family"}
          disabled={loading}
          onSelect={() => setSelected("family")}
        />
      </div>

      <PendingButton
        pending={loading}
        // Picking a role inserts a profile row guarded by a unique constraint, so
        // a repeat is safe.
        mode="retry"
        onClick={handleSubmit}
        onRetry={handleSubmit}
        disabled={!selected}
        idleLabel="Continue"
        workingLabel="Setting up..."
        className={`bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 h-11 w-full text-base font-semibold transition-all disabled:cursor-not-allowed ${
          selected && !loading
            ? "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200"
            : ""
        }`}
      />
    </div>
  );
}

interface RoleCardProps {
  role: Role;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

function RoleCard({
  role,
  title,
  description,
  icon: Icon,
  selected,
  disabled,
  onSelect,
}: RoleCardProps) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={() => !disabled && onSelect()}
      disabled={disabled}
      data-role={role}
      className="focus-visible:ring-teal rounded-xl text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Card
        className={`transition-all duration-200 active:scale-[0.98] ${
          selected
            ? "border-teal bg-teal/5 ring-teal/20 -translate-y-0.5 shadow-md ring-2"
            : "border-sage/20 hover:border-sage hover:-translate-y-0.5 hover:shadow-md"
        }`}
      >
        <CardHeader>
          <div
            key={`${role}-${selected}`}
            className={`mb-1 flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              selected
                ? "bg-teal text-warm-white motion-safe:animate-icon-pop"
                : "bg-teal/10 text-teal"
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{description}</p>
        </CardContent>
      </Card>
    </button>
  );
}
