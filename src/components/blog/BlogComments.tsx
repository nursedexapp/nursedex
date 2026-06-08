import { getApprovedComments } from "@/lib/comments/queries";
import { CommentForm } from "@/components/blog/CommentForm";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export async function BlogComments({ postId }: { postId: string }) {
  const comments = await getApprovedComments(postId);

  return (
    <section className="border-sage-light/40 mt-12 border-t pt-8">
      <h2 className="font-heading text-soft-black mb-6 text-xl font-semibold">
        Comments
        {comments.length > 0 && (
          <span className="text-soft-black-light font-normal">
            {" "}
            ({comments.length})
          </span>
        )}
      </h2>

      {comments.length === 0 ? (
        <p className="text-soft-black-light mb-8 text-sm">
          Be the first to comment.
        </p>
      ) : (
        <ul className="mb-8 space-y-6">
          {comments.map((c) => (
            <li key={c.id}>
              <div className="text-soft-black-light flex items-center gap-2 text-sm">
                <span className="text-soft-black font-medium">
                  {c.author_name}
                </span>
                <span>{formatDate(c.created_at)}</span>
              </div>
              <p className="text-soft-black mt-1 whitespace-pre-wrap">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <CommentForm postId={postId} />
    </section>
  );
}
