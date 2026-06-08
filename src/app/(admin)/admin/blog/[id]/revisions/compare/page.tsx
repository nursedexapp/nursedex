import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRevision } from "@/lib/blog/revisions";
import { diffRevisions } from "@/lib/blog/revision-diff";
import { RevisionDiffView } from "@/components/admin/RevisionDiffView";

export const metadata: Metadata = {
  title: "Compare revisions | NurseDex Admin",
  robots: { index: false, follow: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface ComparePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function ComparePage({
  params,
  searchParams,
}: ComparePageProps) {
  const { id } = await params;
  const { from: fromId, to: toId } = await searchParams;
  if (!fromId || !toId) notFound();

  const [from, to] = await Promise.all([
    getRevision(fromId),
    getRevision(toId),
  ]);
  if (!from || !to || from.post_id !== id || to.post_id !== id) notFound();

  const diff = diffRevisions(from, to);

  return (
    <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <Link
        href={`/admin/blog/${id}/revisions`}
        className="text-soft-black-light hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to history
      </Link>
      <h1 className="font-heading text-soft-black text-2xl font-semibold">
        Compare revisions
      </h1>
      <p className="text-soft-black-light mt-1 mb-6 text-sm">
        {formatDate(from.created_at)} &rarr; {formatDate(to.created_at)}.{" "}
        <span className="text-error">Removed</span> /{" "}
        <span className="text-success">added</span>.
      </p>

      <RevisionDiffView diff={diff} />
    </div>
  );
}
