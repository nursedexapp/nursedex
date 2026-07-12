import type { DiffPart, RevisionDiff } from "@/lib/blog/revision-diff";

function DiffParts({ parts }: { parts: DiffPart[] }) {
  if (parts.length === 0 || parts.every((p) => !p.value)) {
    return <span className="text-soft-black-light italic">(empty)</span>;
  }
  return (
    <>
      {parts.map((p, i) =>
        p.added ? (
          <ins
            key={i}
            className="bg-success/15 text-success rounded px-0.5 no-underline"
          >
            {p.value}
          </ins>
        ) : p.removed ? (
          <del key={i} className="bg-error/15 text-error rounded px-0.5">
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

function Field({ label, parts }: { label: string; parts: DiffPart[] }) {
  return (
    <div>
      <h2 className="text-soft-black-light mb-1 text-xs font-semibold tracking-wide uppercase">
        {label}
      </h2>
      <p className="text-soft-black leading-relaxed">
        <DiffParts parts={parts} />
      </p>
    </div>
  );
}

/**
 * Renders a word-level diff of two revisions. Removed text is struck through
 * in red, added text highlighted in green.
 */
export function RevisionDiffView({ diff }: { diff: RevisionDiff }) {
  return (
    <div className="space-y-6">
      <Field label="Title" parts={diff.title} />
      <Field label="Excerpt" parts={diff.excerpt} />
      <Field label="Body" parts={diff.body} />
    </div>
  );
}
