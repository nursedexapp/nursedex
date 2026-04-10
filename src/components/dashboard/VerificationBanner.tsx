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
    label: "Pending Verification",
    description:
      "Our team is reviewing your license. This usually takes 24 to 72 hours.",
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-800",
    badge: "bg-amber-100 text-amber-800",
  },
  verified: {
    icon: CheckCircle2,
    label: "Verified",
    description:
      "Your license has been verified. Your profile is visible to families.",
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-800",
    badge: "bg-emerald-100 text-emerald-800",
  },
  rejected: {
    icon: XCircle,
    label: "Verification Rejected",
    description: "Please update your profile and resubmit for verification.",
    bg: "bg-red-50 border-red-200",
    text: "text-red-800",
    badge: "bg-red-100 text-red-800",
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
              Reason: {rejectedReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
