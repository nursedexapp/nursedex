import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  postTitle: z.string(),
  postUrl: z.string().url(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { CommentApproved } =
        await import("@/lib/email/templates/CommentApproved");
      return {
        from: "NurseDex Blog <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Your comment is now live",
        react: CommentApproved({
          postTitle: data.postTitle,
          postUrl: data.postUrl,
        }),
      };
    },
    "comment approved",
  );
}
