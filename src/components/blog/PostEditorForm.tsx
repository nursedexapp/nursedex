"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { toast } from "sonner";
import { Loader2, Upload, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PostEditor } from "@/components/blog/PostEditor";
import { savePost, autosavePost } from "@/lib/blog/actions";
import type { BlogIntent } from "@/lib/schemas/blog";
import type { BlogPost, TiptapDoc } from "@/types/database";

interface PostEditorFormProps {
  post: BlogPost | null;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  // Render in the browser's local zone for a datetime-local input.
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function PostEditorForm({ post }: PostEditorFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState<TiptapDoc | null>(post?.content ?? null);
  const [coverImageUrl, setCoverImageUrl] = useState(post?.cover_image_url ?? "");
  const [seoTitle, setSeoTitle] = useState(post?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(post?.seo_description ?? "");
  const [showSchedule, setShowSchedule] = useState(post?.status === "scheduled");
  const [publishAtLocal, setPublishAtLocal] = useState(
    toLocalInput(post?.publish_at ?? null),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [id, setId] = useState(post?.id);
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Autosave only applies to content that is not publicly visible: a new
  // post, a draft, or an archived post. We never silently rewrite a live
  // published or scheduled post; those rely on the unsaved-changes guard.
  const autosaveEnabled =
    !post || post.status === "draft" || post.status === "archived";

  // Serialized snapshot of the editable fields. When it differs from the
  // last saved snapshot the form is dirty (has unsaved edits).
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
      }),
    [title, slug, excerpt, content, coverImageUrl, seoTitle, seoDescription],
  );
  const savedSnapshotRef = useRef(snapshot);
  const latestSnapshotRef = useRef(snapshot);
  latestSnapshotRef.current = snapshot;
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDirty(snapshot !== savedSnapshotRef.current);
  }, [snapshot]);

  // Warn before a hard navigation (refresh, tab close, external link) when
  // there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Debounced autosave: 2s after the last edit, when enabled, dirty, not
  // mid manual save, and the title (which the slug derives from) is set.
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
        content: content ?? { type: "doc", content: [] },
        cover_image_url: coverImageUrl || undefined,
        seo_title: seoTitle || undefined,
        seo_description: seoDescription || undefined,
      })
        .then((res) => {
          if (!res.success) {
            setAutosaveState("error");
            return;
          }
          if (res.id && !id) setId(res.id);
          savedSnapshotRef.current = sent;
          // Only clear dirty if nothing changed while we were saving.
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
  ]);

  function submit(intent: BlogIntent) {
    setErrors({});
    const publishAtIso =
      intent === "schedule" && publishAtLocal
        ? new Date(publishAtLocal).toISOString()
        : undefined;

    startTransition(async () => {
      const res = await savePost({
        id,
        intent,
        title,
        slug: slug || undefined,
        excerpt: excerpt || undefined,
        content: content ?? { type: "doc", content: [] },
        cover_image_url: coverImageUrl || undefined,
        seo_title: seoTitle || undefined,
        seo_description: seoDescription || undefined,
        publish_at: publishAtIso,
      });

      if (!res.success) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(
          res.fieldErrors
            ? "Please fix the highlighted fields."
            : "Something went wrong. Please try again.",
        );
        return;
      }
      // Clear the dirty state so the unsaved-changes guard does not fire
      // as we navigate away after a successful save.
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
      const res = await fetch("/api/admin/blog/images", { method: "POST", body });
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

  const err = (field: string) =>
    errors[field] ? (
      <p className="text-error mt-1 text-sm">{errors[field]}</p>
    ) : null;

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
          onChange={(e) => setSlug(e.target.value)}
          placeholder="Auto-generated from the title if left blank"
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
          <Input
            id="publish_at"
            type="datetime-local"
            value={publishAtLocal}
            onChange={(e) => setPublishAtLocal(e.target.value)}
            className="mt-1 w-auto"
          />
          {err("publish_at")}
        </div>
      )}

      <div className="border-border flex flex-wrap items-center gap-3 border-t pt-6">
        <Button onClick={() => submit("publish")} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Publish now
        </Button>
        {showSchedule ? (
          <Button
            variant="secondary"
            onClick={() => submit("schedule")}
            disabled={pending}
          >
            Schedule
          </Button>
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
        <Button
          variant="outline"
          onClick={() => submit("draft")}
          disabled={pending}
        >
          Save draft
        </Button>

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
