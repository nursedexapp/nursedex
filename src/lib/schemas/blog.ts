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
  content: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, "Write some content"),
});

/**
 * Content as sent from the editor. The client serializes the Tiptap JSON to
 * a string before calling the server action: passing the raw object loses
 * node `attrs` (heading level, image src, embed url, etc.) across the
 * Server Action serialization boundary, so we send a string and parse it
 * here. An object is still accepted (older callers, tests).
 */
export const contentInputSchema = z.preprocess((v) => {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}, tiptapDocSchema);

export const blogIntentSchema = z.enum(["draft", "publish", "schedule"]);
export type BlogIntent = z.infer<typeof blogIntentSchema>;

export const blogPostSchema = z
  .object({
    /** An EXISTING post being edited. Absent means this save creates one. */
    id: z.string().uuid().optional(),
    /**
     * The id a brand-new post will be created under, minted by the editor (#696).
     *
     * Kept separate from `id` on purpose. savePost decides create-versus-update
     * by whether it was handed an `id`, and an UPDATE against a row that does not
     * exist yet succeeds while saving nothing, so reusing `id` for this would turn
     * every creation into a silent no-op.
     */
    new_id: z.string().uuid().optional(),
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
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters, numbers, and hyphens",
      )
      .optional()
      .or(z.literal("")),
    excerpt: z
      .string()
      .trim()
      .max(
        BLOG_EXCERPT_MAX,
        `Keep the excerpt under ${BLOG_EXCERPT_MAX} characters`,
      )
      .optional()
      .or(z.literal("")),
    content: contentInputSchema,
    cover_image_url: z
      .string()
      .url("Cover image must be a valid URL")
      .optional()
      .or(z.literal("")),
    seo_title: z
      .string()
      .trim()
      .max(BLOG_SEO_TITLE_MAX)
      .optional()
      .or(z.literal("")),
    seo_description: z
      .string()
      .trim()
      .max(BLOG_SEO_DESCRIPTION_MAX)
      .optional()
      .or(z.literal("")),
    // ISO datetime, required only when intent is "schedule"
    publish_at: z.string().datetime().optional().or(z.literal("")),
    // Taxonomy: an existing category id (categories are created
    // explicitly) and free-form tag names (find-or-create in the action).
    category_id: z.string().uuid().optional().or(z.literal("")),
    tags: z.array(z.string().trim().max(50)).max(20).optional(),
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
  /**
   * The id a brand-new post will be created under, minted by the editor (#696).
   * The editor hands the SAME one to autosavePost and savePost, so whichever
   * creates the post first wins and the other collides on it rather than writing
   * a second post. Autosave is the likelier offender of the two: it is debounced
   * and fires repeatedly, so two autosaves racing before the editor learns the
   * new id used to leave the author with two posts.
   */
  new_id: z.string().uuid().optional(),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(BLOG_TITLE_MAX, `Keep the title under ${BLOG_TITLE_MAX} characters`),
  slug: z
    .string()
    .trim()
    .max(BLOG_SLUG_MAX)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens",
    )
    .optional()
    .or(z.literal("")),
  excerpt: z.string().trim().max(BLOG_EXCERPT_MAX).optional().or(z.literal("")),
  content: contentInputSchema,
  cover_image_url: z.string().url().optional().or(z.literal("")),
  seo_title: z
    .string()
    .trim()
    .max(BLOG_SEO_TITLE_MAX)
    .optional()
    .or(z.literal("")),
  seo_description: z
    .string()
    .trim()
    .max(BLOG_SEO_DESCRIPTION_MAX)
    .optional()
    .or(z.literal("")),
  category_id: z.string().uuid().optional().or(z.literal("")),
  tags: z.array(z.string().trim().max(50)).max(20).optional(),
});

export type BlogAutosaveInput = z.infer<typeof blogAutosaveSchema>;

export const BLOG_CATEGORY_NAME_MAX = 60;

/** Input for creating a category from the editor. */
export const blogCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(
      BLOG_CATEGORY_NAME_MAX,
      `Keep it under ${BLOG_CATEGORY_NAME_MAX} characters`,
    ),
});
