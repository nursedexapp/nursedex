import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GitCompare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { getPostById } from "@/lib/blog/queries";
import { getRevisions } from "@/lib/blog/revisions";
import { extractPlainText } from "@/lib/blog/text";
import { RestoreRevisionButton } from "@/components/admin/RestoreRevisionButton";

export const metadata: Metadata = {
  title: "Revision history | NurseDex Admin",
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

interface RevisionsPageProps {
  params: Promise<{ id: string }>;
}

export default async function RevisionsPage({ params }: RevisionsPageProps) {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  const revisions = await getRevisions(id);

  return (
    <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <Link
        href={`/admin/blog/${id}/edit`}
        className="text-soft-black-light hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to editor
      </Link>
      <h1 className="font-heading text-soft-black text-2xl font-semibold">
        Revision history
      </h1>
      <p className="text-soft-black-light mt-1 mb-6 text-sm">
        Saved versions of &ldquo;{post.title}&rdquo;. Each explicit save adds a
        version; autosaves do not.
      </p>

      {revisions.length === 0 ? (
        <Card className="border-sage/20">
          <CardContent className="text-soft-black-light py-12 text-center text-sm">
            No saved versions yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {revisions.map((rev, i) => {
            const snippet = extractPlainText(rev.content).slice(0, 160);
            return (
              <Card key={rev.id} className="border-sage/20">
                <CardContent className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-soft-black text-sm font-medium">
                        {formatDate(rev.created_at)}
                      </span>
                      {i === 0 && (
                        <Badge className="bg-teal/10 text-teal-dark">
                          Current
                        </Badge>
                      )}
                    </div>
                    <p className="text-soft-black-light mt-1 truncate text-sm">
                      {rev.title}
                      {snippet ? ` — ${snippet}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {i < revisions.length - 1 && (
                      <Link
                        href={`/admin/blog/${id}/revisions/compare?from=${revisions[i + 1].id}&to=${rev.id}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        <GitCompare className="size-4" />
                        Compare
                      </Link>
                    )}
                    {i !== 0 && (
                      <RestoreRevisionButton revisionId={rev.id} postId={id} />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
