"use client";

import { useEffect, useState } from "react";
import { BlogArticle } from "@/components/blog/BlogArticle";
import { readPreviewDraft } from "@/lib/blog/preview-draft";
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

/**
 * Renders the saved post, then (after mount) overlays any unsaved editor
 * body the editor stashed in localStorage when "Preview" was clicked, so
 * the preview reflects in-progress edits without persisting them. Starting
 * from the saved post keeps the server and first client render identical.
 */
export function BlogPreviewArticle(props: Props) {
  const [draftPost, setDraftPost] = useState<BlogPost | null>(null);

  useEffect(() => {
    const draft = readPreviewDraft(props.post.id);
    if (draft) {
      setDraftPost({
        ...props.post,
        title: draft.title,
        excerpt: draft.excerpt,
        content: draft.content,
        cover_image_url: draft.cover_image_url,
      });
    }
  }, [props.post]);

  return (
    <>
      {draftPost && (
        <div className="border-teal/30 bg-teal/5 text-teal-dark mb-6 rounded-md border px-3 py-2 text-sm">
          Showing unsaved edits from the editor.
        </div>
      )}
      <BlogArticle {...props} post={draftPost ?? props.post} />
    </>
  );
}
