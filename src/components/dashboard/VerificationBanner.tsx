import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import type { VerificationStatus } from "@/types/enums";

interface VerificationBannerProps {
  status: VerificationStatus;
  rejectedReason?: string | null;
}

const CONFIG = {
  pending: {
    icon: Clock,
    label: "Reviewing",
    description:
      "We're reviewing your license. Usually 24 to 72 hours. We'll email you the moment your profile is live.",
    bg: "bg-warning/10 border-warning/30",
    text: "text-warning",
    badge: "bg-warning/20 text-warning",
  },
  verified: {
    icon: CheckCircle2,
    label: "Live",
    description:
      "Families on Long Island can now find you. Share your link to start collecting reviews.",
    bg: "bg-success/10 border-success/30",
    text: "text-success",
    badge: "bg-success/20 text-success",
  },
  rejected: {
    icon: XCircle,
    label: "Action needed",
    description:
      "Update what we flagged below and resubmit. We'll re-review within 24 hours.",
    bg: "bg-error/10 border-error/30",
    text: "text-error",
    badge: "bg-error/20 text-error",
  },
};

export function VerificationBanner({
  status,
  rejectedReason,
}: VerificationBannerProps) {
  const config = CONFIG[status];
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg border p-4", config.bg)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", config.text)} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs", config.badge)}>
              {config.label}
            </Badge>
          </div>
          <p className={cn("mt-1 text-sm", config.text)}>
            {config.description}
          </p>
          {status === "rejected" && rejectedReason && (
            <p className={cn("mt-1 text-sm font-medium", config.text)}>
              What to fix: {rejectedReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
