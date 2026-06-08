import { z } from "zod";

export const COMMENT_NAME_MAX = 60;
export const COMMENT_BODY_MIN = 2;
export const COMMENT_BODY_MAX = 2000;

export const blogCommentSchema = z.object({
  post_id: z.string().uuid(),
  author_name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(COMMENT_NAME_MAX, `Keep your name under ${COMMENT_NAME_MAX} characters`),
  author_email: z.string().trim().toLowerCase().email("Enter a valid email"),
  body: z
    .string()
    .trim()
    .min(COMMENT_BODY_MIN, "Your comment is too short")
    .max(COMMENT_BODY_MAX, `Keep your comment under ${COMMENT_BODY_MAX} characters`),
  // Honeypot: bots fill this; handled in the action.
  website: z.string().optional(),
});

export type BlogCommentInput = z.infer<typeof blogCommentSchema>;
