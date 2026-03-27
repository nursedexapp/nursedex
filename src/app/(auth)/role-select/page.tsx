"use client";

import { useState } from "react";
import { selectRole } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="w-full max-w-lg">
      <div className="text-center mb-8">
        <h1 className="font-heading text-2xl font-semibold text-teal mb-2">
          NurseDex
        </h1>
        <p className="text-xl font-medium text-soft-black">
          How will you use NurseDex?
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          This helps us personalize your experience.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <button onClick={() => setSelected("nurse")} className="text-left">
          <Card
            className={`cursor-pointer transition-all ${
              selected === "nurse"
                ? "border-teal ring-2 ring-teal/20"
                : "border-sage/20 hover:border-sage"
            }`}
          >
            <CardHeader>
              <CardTitle className="text-lg">I am a nurse</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create a profile, get found by families, and grow your practice.
              </p>
            </CardContent>
          </Card>
        </button>

        <button onClick={() => setSelected("family")} className="text-left">
          <Card
            className={`cursor-pointer transition-all ${
              selected === "family"
                ? "border-teal ring-2 ring-teal/20"
                : "border-sage/20 hover:border-sage"
            }`}
          >
            <CardHeader>
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
        className="w-full"
        disabled={!selected || loading}
      >
        {loading ? "Setting up..." : "Continue"}
      </Button>
    </div>
  );
}
