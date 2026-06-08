import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  postTitle: z.string(),
  authorName: z.string(),
  body: z.string(),
  moderateUrl: z.string().url(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { CommentSubmitted } =
        await import("@/lib/email/templates/CommentSubmitted");
      return {
        from: "NurseDex Blog <noreply@nursedex.com>",
        to: "support@nursedex.com",
        subject: "[Blog] New comment awaiting review",
        react: CommentSubmitted(data),
      };
    },
    "comment submitted",
  );
}
