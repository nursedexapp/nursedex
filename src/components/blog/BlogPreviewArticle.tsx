"use client";

import { useEffect, useState } from "react";
import { BlogArticle } from "@/components/blog/BlogArticle";
import { readPreviewDraft } from "@/lib/blog/preview-draft";
import { slugify } from "@/lib/blog/slugify";
import type {
  BlogPost,
  BlogCategory,
  BlogTag,
  BlogPostListItem,
} from "@/types/database";

interface Props {
  post: BlogPost;
  category: BlogCategory | null;
  tags: BlogTag[];
  authorName: string | null;
  related: BlogPostListItem[];
}

interface Override {
  post: BlogPost;
  category: BlogCategory | null;
  tags: BlogTag[];
}

/**
 * Renders the saved post, then (after mount) overlays any unsaved editor
 * state the editor stashed in localStorage when "Preview" was clicked: the
 * body (title/excerpt/content/cover) plus the selected category and tags,
 * so the preview matches the editor without persisting anything. Starting
 * from the saved post keeps the server and first client render identical.
 */
export function BlogPreviewArticle(props: Props) {
  const [override, setOverride] = useState<Override | null>(null);

  useEffect(() => {
    const draft = readPreviewDraft(props.post.id);
    if (!draft) return;
    setOverride({
      post: {
        ...props.post,
        title: draft.title,
        excerpt: draft.excerpt,
        content: draft.content,
        cover_image_url: draft.cover_image_url,
      },
      // Synthesized from names so the chips match the editor; slugs are
      // approximate (this is a preview, the chip links are not navigated).
      category: draft.categoryName
        ? {
            id: "preview",
            name: draft.categoryName,
            slug: slugify(draft.categoryName),
            created_at: "",
            updated_at: "",
          }
        : null,
      tags: (draft.tags ?? []).map((name, i) => ({
        id: `preview-${i}`,
        name,
        slug: slugify(name),
        created_at: "",
      })),
    });
  }, [props.post]);

  const post = override?.post ?? props.post;
  const category = override ? override.category : props.category;
  const tags = override ? override.tags : props.tags;

  return (
    <>
      {override && (
        <div className="border-teal/30 bg-teal/5 text-teal-dark mb-6 rounded-md border px-3 py-2 text-sm">
          Showing unsaved edits from the editor.
        </div>
      )}
      <BlogArticle
        post={post}
        category={category}
        tags={tags}
        authorName={props.authorName}
        related={props.related}
      />
    </>
  );
}
