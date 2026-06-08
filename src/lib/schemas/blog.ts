import { z } from "zod";

export const BLOG_TITLE_MAX = 160;
export const BLOG_SLUG_MAX = 160;
export const BLOG_EXCERPT_MAX = 300;
export const BLOG_SEO_TITLE_MAX = 70;
export const BLOG_SEO_DESCRIPTION_MAX = 200;

/**
 * A Tiptap document. We validate the shape loosely (type "doc" with a
 * non-empty content array); the public renderer is the real gate on what
 * node and mark types are allowed, so we do not duplicate that allowlist
 * here.
 */
export const tiptapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.record(z.string(), z.unknown())).min(1, "Write some content"),
});

export const blogIntentSchema = z.enum(["draft", "publish", "schedule"]);
export type BlogIntent = z.infer<typeof blogIntentSchema>;

export const blogPostSchema = z
  .object({
    id: z.string().uuid().optional(),
    intent: blogIntentSchema,
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(BLOG_TITLE_MAX, `Keep the title under ${BLOG_TITLE_MAX} characters`),
    slug: z
      .string()
      .trim()
      .max(BLOG_SLUG_MAX)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens")
      .optional()
      .or(z.literal("")),
    excerpt: z
      .string()
      .trim()
      .max(BLOG_EXCERPT_MAX, `Keep the excerpt under ${BLOG_EXCERPT_MAX} characters`)
      .optional()
      .or(z.literal("")),
    content: tiptapDocSchema,
    cover_image_url: z
      .string()
      .url("Cover image must be a valid URL")
      .optional()
      .or(z.literal("")),
    seo_title: z.string().trim().max(BLOG_SEO_TITLE_MAX).optional().or(z.literal("")),
    seo_description: z
      .string()
      .trim()
      .max(BLOG_SEO_DESCRIPTION_MAX)
      .optional()
      .or(z.literal("")),
    // ISO datetime, required only when intent is "schedule"
    publish_at: z.string().datetime().optional().or(z.literal("")),
  })
  .refine((v) => v.intent !== "schedule" || !!v.publish_at, {
    message: "Pick a date and time to schedule.",
    path: ["publish_at"],
  });

export type BlogPostInput = z.infer<typeof blogPostSchema>;

/**
 * Input for a background autosave. Like a post save but with no `intent`
 * and no scheduling: autosave never changes a post's status or publish
 * time, it only persists the editable fields. A title is still required
 * because the slug derives from it.
 */
export const blogAutosaveSchema = z.object({
  id: z.string().uuid().optional(),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(BLOG_TITLE_MAX, `Keep the title under ${BLOG_TITLE_MAX} characters`),
  slug: z
    .string()
    .trim()
    .max(BLOG_SLUG_MAX)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens")
    .optional()
    .or(z.literal("")),
  excerpt: z.string().trim().max(BLOG_EXCERPT_MAX).optional().or(z.literal("")),
  content: tiptapDocSchema,
  cover_image_url: z.string().url().optional().or(z.literal("")),
  seo_title: z.string().trim().max(BLOG_SEO_TITLE_MAX).optional().or(z.literal("")),
  seo_description: z
    .string()
    .trim()
    .max(BLOG_SEO_DESCRIPTION_MAX)
    .optional()
    .or(z.literal("")),
});

export type BlogAutosaveInput = z.infer<typeof blogAutosaveSchema>;
