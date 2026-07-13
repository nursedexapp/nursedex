import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUniqueViolation } from "@/lib/db/postgres-errors";

export type CreatePostOutcome =
  | { outcome: "created" }
  /** A post already existed under this id and it is ours, so this is a repeat. */
  | { outcome: "already_created" }
  /** A post exists under this id and it belongs to someone else. Refuse. */
  | { outcome: "not_owner" }
  | { outcome: "error"; message: string };

/**
 * Create a blog post under an id the EDITOR minted, in a way that is safe to run
 * twice (#696).
 *
 * The bug: both savePost and autosavePost created a new post by inserting and
 * letting Postgres invent the id, and `ensureUniqueSlug` handed a second insert a
 * DIFFERENT slug rather than letting it collide. So nothing in the database could
 * tell a repeat apart from a genuine new post, and a retried save (or two
 * debounced autosaves racing before the editor learned the new id) left the
 * author with TWO posts.
 *
 * Both callers now hand it the same minted id, so whichever gets there first
 * creates the post and the other collides on the primary key. This lives in one
 * place because it was about to be written twice, and the ownership check below
 * is not something to re-derive per call site.
 */
export async function createPostWithMintedId(
  supabase: SupabaseClient,
  args: {
    newId: string;
    authorId: string;
    fields: Record<string, unknown>;
  },
): Promise<CreatePostOutcome> {
  const { error } = await supabase
    .from("blog_posts")
    .insert({ id: args.newId, ...args.fields, author_id: args.authorId });

  if (!error) return { outcome: "created" };
  if (!isUniqueViolation(error)) {
    return { outcome: "error", message: error.message };
  }

  // A post already exists under this id. Almost always that is this same save
  // landing twice, which is the entire point. But the id arrives from the client,
  // so an admin could also aim it at a COLLEAGUE'S post and turn a "create" into
  // a silent overwrite of their work. Every author here is an admin and RLS would
  // happily allow that write, so this check is the only thing in the way.
  const { data: existing, error: readError } = await supabase
    .from("blog_posts")
    .select("author_id")
    .eq("id", args.newId)
    .maybeSingle();
  if (readError) {
    return { outcome: "error", message: readError.message };
  }
  const owner = (existing as { author_id: string } | null)?.author_id;
  if (owner !== args.authorId) return { outcome: "not_owner" };

  // Our own earlier attempt already created the row. Bring it up to date with
  // what is being saved now, rather than stranding the author on whatever that
  // first attempt happened to write.
  const { error: updateError } = await supabase
    .from("blog_posts")
    .update(args.fields)
    .eq("id", args.newId);
  if (updateError) {
    return { outcome: "error", message: updateError.message };
  }

  return { outcome: "already_created" };
}
