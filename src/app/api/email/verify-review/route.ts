import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  reviewerName: z.string().min(1).max(50),
  verificationToken: z.uuid(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { VerifyReview } =
        await import("@/lib/email/templates/VerifyReview");
      const verifyUrl = `https://nursedex.com/reviews/verify/${data.verificationToken}`;
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Confirm your NurseDex review",
        react: VerifyReview({ reviewerName: data.reviewerName, verifyUrl }),
      };
    },
    "Verify review",
  );
}
