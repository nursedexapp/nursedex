"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmHireFromToken, rejectHireFromToken } from "@/lib/hires/actions";

interface HireDecisionButtonsProps {
  token: string;
}

export function HireDecisionButtons({ token }: HireDecisionButtonsProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const decide = (
    fn: typeof confirmHireFromToken | typeof rejectHireFromToken,
    label: string,
  ) => {
    startTransition(async () => {
      const result = await fn({ token });
      if (!result.success) {
        toast.error(`Could not ${label.toLowerCase()}. Please try again.`);
        return;
      }
      toast.success(label === "Confirm" ? "Confirmed" : "Rejected");
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => decide(confirmHireFromToken, "Confirm")}
        disabled={pending}
      >
        Yes, I hired them
      </Button>
      <Button
        variant="outline"
        onClick={() => decide(rejectHireFromToken, "Reject")}
        disabled={pending}
      >
        No, I didn&apos;t
      </Button>
    </div>
  );
}
