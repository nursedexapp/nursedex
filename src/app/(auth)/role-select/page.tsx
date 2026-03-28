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
        <p className="text-sm text-muted-foreground mt-1">
          This helps us personalize your experience.
        </p>
      </div>

      <div role="radiogroup" aria-label="Account type" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <button
          role="radio"
          aria-checked={selected === "nurse"}
          onClick={() => !loading && setSelected("nurse")}
          disabled={loading}
          className="text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Card
            className={`transition-all ${
              selected === "nurse"
                ? "border-teal ring-2 ring-teal/20"
                : "border-sage/20 hover:border-sage"
            }`}
          >
            <CardHeader>
              <Stethoscope className="h-6 w-6 text-teal mb-1" />
              <CardTitle className="text-lg">I am a nurse</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
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
          className="text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Card
            className={`transition-all ${
              selected === "family"
                ? "border-teal ring-2 ring-teal/20"
                : "border-sage/20 hover:border-sage"
            }`}
          >
            <CardHeader>
              <Heart className="h-6 w-6 text-teal mb-1" />
              <CardTitle className="text-lg">I need care</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Find qualified nurses in your area and connect with them directly.
              </p>
            </CardContent>
          </Card>
        </button>
      </div>

      <Button
        onClick={handleSubmit}
        className="w-full h-11 bg-teal text-warm-white font-semibold text-base hover:bg-teal-dark transition-colors disabled:bg-teal/50 disabled:cursor-not-allowed"
        disabled={!selected || loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Setting up...
          </>
        ) : "Continue"}
      </Button>
    </div>
  );
}
