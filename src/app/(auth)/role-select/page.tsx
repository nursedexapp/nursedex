"use client";

import { useState } from "react";
import { selectRole } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Loader2, Stethoscope } from "lucide-react";

export default function RoleSelectPage() {
  const [selected, setSelected] = useState<"nurse" | "family" | null>(null);
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
        <button
          role="radio"
          aria-checked={selected === "nurse"}
          onClick={() => !loading && setSelected("nurse")}
          disabled={loading}
          className="focus-visible:ring-teal rounded-lg text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Card
            className={`transition-all ${
              selected === "nurse"
                ? "border-teal ring-teal/20 ring-2"
                : "border-sage/20 hover:border-sage"
            }`}
          >
            <CardHeader>
              <Stethoscope className="text-teal mb-1 h-6 w-6" />
              <CardTitle className="text-lg">I am a nurse</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Create a profile, get found by families, and grow your practice.
              </p>
            </CardContent>
          </Card>
        </button>

        <button
          role="radio"
          aria-checked={selected === "family"}
          onClick={() => !loading && setSelected("family")}
          disabled={loading}
          className="focus-visible:ring-teal rounded-lg text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Card
            className={`transition-all ${
              selected === "family"
                ? "border-teal ring-teal/20 ring-2"
                : "border-sage/20 hover:border-sage"
            }`}
          >
            <CardHeader>
              <Heart className="text-teal mb-1 h-6 w-6" />
              <CardTitle className="text-lg">I need care</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Find qualified nurses in your area and connect with them
                directly.
              </p>
            </CardContent>
          </Card>
        </button>
      </div>

      <Button
        onClick={handleSubmit}
        className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 h-11 w-full text-base font-semibold transition-colors disabled:cursor-not-allowed"
        disabled={!selected || loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Setting up...
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </div>
  );
}
