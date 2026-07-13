"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { toast } from "sonner";
import { Loader2, Upload, X, Check, Plus, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PostEditor } from "@/components/blog/PostEditor";
import { DateTimePicker } from "@/components/blog/DateTimePicker";
import { savePost, autosavePost, createCategory } from "@/lib/blog/actions";
import { writePreviewDraft } from "@/lib/blog/preview-draft";
import { slugify } from "@/lib/blog/slugify";
import type { BlogIntent } from "@/lib/schemas/blog";
import type {
  BlogCategory,
  BlogPost,
  BlogTag,
  TiptapDoc,
} from "@/types/database";
import { PendingButton } from "@/components/ui/pending-button";
import { useInFlight } from "@/components/ui/use-in-flight";

interface PostEditorFormProps {
  post: BlogPost | null;
  categories: BlogCategory[];
  allTags: BlogTag[];
  postTags: BlogTag[];
}

type CategoryOption = { id: string; name: string };

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  // Render in the browser's local zone for a datetime-local input.
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function PostEditorForm({
  post,
  categories: initialCategories,
  allTags,
  postTags,
}: PostEditorFormProps) {
  const router = useRouter();
  // Keyed: three buttons drove one flag, so pressing "Save draft" also greyed
  // "Publish now" into looking like the thing that was running.
  //
  const { inFlight, busy, run, retry } = useInFlight<BlogIntent>();
  const pending = busy;
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  // For a new post, keep the slug in sync with the title as it is typed,
  // until the slug is edited by hand (then leave it alone). Never auto-change
  // an existing post's slug, since that would break its published URL.
  const [slugLocked, setSlugLocked] = useState(Boolean(post?.slug));

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugLocked) setSlug(slugify(value));
  }
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState<TiptapDoc | null>(
    post?.content ?? null,
  );
  const [coverImageUrl, setCoverImageUrl] = useState(
    post?.cover_image_url ?? "",
  );
  const [seoTitle, setSeoTitle] = useState(post?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(
    post?.seo_description ?? "",
  );
  const [showSchedule, setShowSchedule] = useState(
    post?.status === "scheduled",
  );
  const [publishAtLocal, setPublishAtLocal] = useState(
    toLocalInput(post?.publish_at ?? null),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Taxonomy. Categories are picked from existing or created explicitly;
  // tags are free-form chips resolved to ids when the post is saved.
  const [categories, setCategories] = useState<CategoryOption[]>(
    initialCategories.map((c) => ({ id: c.id, name: c.name })),
  );
  const [categoryId, setCategoryId] = useState(post?.category_id ?? "");
  const [tags, setTags] = useState<string[]>(postTags.map((t) => t.name));
  const [tagInput, setTagInput] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  const [id, setId] = useState(post?.id);
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const autosaveEnabled =
    !post || post.status === "draft" || post.status === "archived";

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        title,
        slug,
        excerpt,
        content,
        coverImageUrl,
        seoTitle,
        seoDescription,
        categoryId,
        tags,
      }),
    [
      title,
      slug,
      excerpt,
      content,
      coverImageUrl,
      seoTitle,
      seoDescription,
      categoryId,
      tags,
    ],
  );
  const savedSnapshotRef = useRef(snapshot);
  const latestSnapshotRef = useRef(snapshot);
  latestSnapshotRef.current = snapshot;
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDirty(snapshot !== savedSnapshotRef.current);
  }, [snapshot]);

  // Warn before a hard navigation (refresh, tab close, external link).
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Debounced autosave for non-public posts (new, draft, archived).
  useEffect(() => {
    if (!autosaveEnabled || !dirty || pending || !title.trim()) return;
    const sent = snapshot;
    const handle = setTimeout(() => {
      setAutosaveState("saving");
      autosavePost({
        id,
        title,
        slug: slug || undefined,
        excerpt: excerpt || undefined,
        // Stringified so node attrs survive the server action boundary.
        content: JSON.stringify(content ?? { type: "doc", content: [] }),
        cover_image_url: coverImageUrl || undefined,
        seo_title: seoTitle || undefined,
        seo_description: seoDescription || undefined,
        category_id: categoryId || undefined,
        tags,
      })
        .then((res) => {
          if (!res.success) {
            setAutosaveState("error");
            return;
          }
          if (res.id && !id) setId(res.id);
          savedSnapshotRef.current = sent;
          if (latestSnapshotRef.current === sent) {
            setDirty(false);
            setAutosaveState("saved");
          }
        })
        .catch(() => setAutosaveState("error"));
    }, 2000);
    return () => clearTimeout(handle);
  }, [
    autosaveEnabled,
    dirty,
    pending,
    snapshot,
    id,
    title,
    slug,
    excerpt,
    content,
    coverImageUrl,
    seoTitle,
    seoDescription,
    categoryId,
    tags,
  ]);

  // retry ONLY once the post exists (#669 phase 5).
  //
  // savePost decides create-vs-update from whether it was handed an id. With no
  // id it INSERTS, and ensureUniqueSlug hands a second insert a DIFFERENT slug
  // rather than colliding, so nothing in the database stops it: a retry on a hung
  // save of a brand new post would quietly leave the author with TWO posts. Once
  // the post exists it is a plain UPDATE by id, which is safe to repeat.
  //
  // Making creation retryable too means giving the client the id up front, which
  // changes how savePost tells create from update and needs an author check so an
  // id cannot be used to target someone else's post. Tracked separately.
  const canRetry = Boolean(id);

  function submit(intent: BlogIntent, viaRetry = false) {
    if (busy && !viaRetry) return;
    setErrors({});
    const publishAtIso =
      intent === "schedule" && publishAtLocal
        ? new Date(publishAtLocal).toISOString()
        : undefined;

    // `run` refuses re-entry, which is what stops Publish firing while a draft
    // save is still out there. A retry needs the other door (#669).
    const start = viaRetry ? retry : run;

    start(intent, async (isLatest) => {
      const res = await savePost({
        id,
        intent,
        title,
        slug: slug || undefined,
        excerpt: excerpt || undefined,
        // Stringified so node attrs survive the server action boundary.
        content: JSON.stringify(content ?? { type: "doc", content: [] }),
        cover_image_url: coverImageUrl || undefined,
        seo_title: seoTitle || undefined,
        seo_description: seoDescription || undefined,
        category_id: categoryId || undefined,
        tags,
        publish_at: publishAtIso,
      });

      // Superseded by a retry: this attempt no longer owns the form, and its
      // result would contradict the one the retry already reported.
      if (!isLatest()) return;

      if (!res.success) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(
          res.fieldErrors
            ? "Please fix the highlighted fields."
            : "Something went wrong. Please try again.",
        );
        return;
      }
      savedSnapshotRef.current = latestSnapshotRef.current;
      setDirty(false);
      toast.success(
        intent === "publish"
          ? "Post published."
          : intent === "schedule"
            ? "Post scheduled."
            : "Draft saved.",
      );
      router.push("/admin/blog");
      router.refresh();
    });
  }

  function cancel() {
    if (
      dirty &&
      !window.confirm("You have unsaved changes. Leave without saving?")
    ) {
      return;
    }
    router.push("/admin/blog");
  }

  async function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/blog/images", {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Image upload failed.");
        return;
      }
      setCoverImageUrl(json.url);
    } catch {
      toast.error("Image upload failed.");
    } finally {
      setCoverUploading(false);
    }
  }

  function addTag(value: string) {
    const name = value.trim();
    if (!name) return;
    setTags((prev) =>
      prev.some((t) => t.toLowerCase() === name.toLowerCase())
        ? prev
        : [...prev, name],
    );
    setTagInput("");
  }

  function removeTag(name: string) {
    setTags((prev) => prev.filter((t) => t !== name));
  }

  function onTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  async function onAddCategory() {
    const name = newCategory.trim();
    if (!name) return;
    setAddingCategory(true);
    try {
      const res = await createCategory(name);
      if (!res.success || !res.category) {
        toast.error("Could not add the category.");
        return;
      }
      const created = res.category;
      setCategories((prev) =>
        prev.some((c) => c.id === created.id)
          ? prev
          : [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCategoryId(created.id);
      setNewCategory("");
    } finally {
      setAddingCategory(false);
    }
  }

  const err = (field: string) =>
    errors[field] ? (
      <p className="text-error mt-1 text-sm">{errors[field]}</p>
    ) : null;

  const selectClass =
    "border-border bg-warm-white mt-1 h-9 w-full rounded-md border px-3 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="A clear, search-friendly headline"
          className="mt-1"
        />
        {err("title")}
      </div>

      <div>
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugLocked(true);
          }}
          placeholder="Auto-generated from the title"
          className="mt-1"
        />
        <p className="text-soft-black-light mt-1 text-xs">
          The URL will be nursedex.com/blog/{slug || "your-title"}
        </p>
        {err("slug")}
      </div>

      <div>
        <Label htmlFor="excerpt">Excerpt</Label>
        <Textarea
          id="excerpt"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="One or two sentences shown on the blog index and used for SEO if no meta description is set."
          rows={2}
          className="mt-1"
        />
        {err("excerpt")}
      </div>

      <div>
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={selectClass}
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onAddCategory();
              }
            }}
            placeholder="Add a new category"
            className="h-8"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onAddCategory()}
            disabled={addingCategory || !newCategory.trim()}
          >
            {addingCategory ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="tags">Tags</Label>
        <div className="border-border bg-warm-white mt-1 flex flex-wrap items-center gap-1.5 rounded-md border p-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="bg-sage/15 text-soft-black inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
                className="text-soft-black-light hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            id="tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={onTagKeyDown}
            onBlur={() => addTag(tagInput)}
            list="blog-tag-suggestions"
            placeholder={tags.length === 0 ? "Add tags (Enter or comma)" : ""}
            className="min-w-32 flex-1 bg-transparent text-sm outline-none"
          />
          <datalist id="blog-tag-suggestions">
            {allTags.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <Label>Cover image</Label>
        <div className="mt-1">
          {coverImageUrl ? (
            <div className="relative inline-block">
              <NextImage
                src={coverImageUrl}
                alt="Cover preview"
                width={320}
                height={180}
                className="border-border rounded-md border object-cover"
              />
              <button
                type="button"
                onClick={() => setCoverImageUrl("")}
                aria-label="Remove cover image"
                className="bg-soft-black/70 absolute -top-2 -right-2 inline-flex size-6 items-center justify-center rounded-full text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => coverInputRef.current?.click()}
              disabled={coverUploading}
            >
              {coverUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Upload cover
            </Button>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPickCover}
          />
        </div>
      </div>

      <div>
        <Label>Body</Label>
        <div className="mt-1">
          <PostEditor value={content} onChange={setContent} />
        </div>
        {err("content")}
      </div>

      <details className="border-border rounded-md border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          SEO overrides (optional)
        </summary>
        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="seo_title">Meta title</Label>
            <Input
              id="seo_title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="Defaults to the post title"
              className="mt-1"
            />
            {err("seo_title")}
          </div>
          <div>
            <Label htmlFor="seo_description">Meta description</Label>
            <Textarea
              id="seo_description"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              placeholder="Defaults to the excerpt"
              rows={2}
              className="mt-1"
            />
            {err("seo_description")}
          </div>
        </div>
      </details>

      {showSchedule && (
        <div>
          <Label htmlFor="publish_at">Publish at</Label>
          <div className="mt-1">
            <DateTimePicker
              id="publish_at"
              value={publishAtLocal}
              onChange={setPublishAtLocal}
            />
          </div>
          {err("publish_at")}
        </div>
      )}

      <div className="border-border flex flex-wrap items-center gap-3 border-t pt-6">
        <PendingButton
          pending={inFlight === "publish"}
          mode={canRetry ? "retry" : "wait"}
          idleLabel="Publish now"
          workingLabel="Publishing..."
          slowLabel="Still publishing..."
          disabled={busy && inFlight !== "publish"}
          onClick={() => submit("publish")}
          onRetry={() => submit("publish", true)}
        />
        {showSchedule ? (
          <PendingButton
            pending={inFlight === "schedule"}
            mode={canRetry ? "retry" : "wait"}
            variant="secondary"
            idleLabel="Schedule"
            workingLabel="Scheduling..."
            slowLabel="Still scheduling..."
            disabled={busy && inFlight !== "schedule"}
            onClick={() => submit("schedule")}
            onRetry={() => submit("schedule", true)}
          />
        ) : (
          <Button
            variant="secondary"
            type="button"
            onClick={() => setShowSchedule(true)}
            disabled={pending}
          >
            Schedule for later
          </Button>
        )}
        <PendingButton
          pending={inFlight === "draft"}
          mode={canRetry ? "retry" : "wait"}
          variant="outline"
          idleLabel="Save draft"
          workingLabel="Saving..."
          slowLabel="Still saving..."
          disabled={busy && inFlight !== "draft"}
          onClick={() => submit("draft")}
          onRetry={() => submit("draft", true)}
        />

        {id && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              // Stash the current body so the preview tab reflects unsaved
              // edits without persisting them.
              writePreviewDraft(id, {
                title,
                excerpt: excerpt || null,
                content: content ?? { type: "doc", content: [] },
                cover_image_url: coverImageUrl || null,
                categoryName:
                  categories.find((c) => c.id === categoryId)?.name ?? null,
                tags,
              });
              window.open(
                `/blog/preview/${id}`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            <Eye className="size-4" />
            Preview
          </Button>
        )}

        <span
          className="text-soft-black-light ml-auto inline-flex items-center gap-1 text-sm"
          aria-live="polite"
        >
          {autosaveState === "saving" ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Saving…
            </>
          ) : dirty ? (
            "Unsaved changes"
          ) : autosaveState === "saved" ? (
            <>
              <Check className="size-3.5" />
              Saved
            </>
          ) : null}
        </span>

        <Button
          variant="ghost"
          type="button"
          onClick={cancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
