import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  toURLSearchParams,
  type SearchFilters,
} from "@/lib/nurses/search-params";

interface SearchPaginationProps {
  currentPage: number;
  totalPages: number;
  filters: SearchFilters;
}

export function SearchPagination({
  currentPage,
  totalPages,
  filters,
}: SearchPaginationProps) {
  const hrefForPage = (page: number) => {
    const params = toURLSearchParams({ ...filters, page });
    const query = params.toString();
    return query ? `/nurses?${query}` : "/nurses";
  };

  const pageNumbers = buildPageNumbers(currentPage, totalPages);

  return (
    <nav
      className="mt-10 flex items-center justify-center gap-1"
      aria-label="Search results pagination"
    >
      <PageLink
        href={currentPage > 1 ? hrefForPage(currentPage - 1) : null}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </PageLink>
      {pageNumbers.map((item, idx) =>
        item === "…" ? (
          <span
            key={`ellipsis-${idx}`}
            className="text-muted-foreground px-2 text-sm"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <PageLink
            key={item}
            href={item === currentPage ? null : hrefForPage(item)}
            isActive={item === currentPage}
            aria-current={item === currentPage ? "page" : undefined}
          >
            {item}
          </PageLink>
        ),
      )}
      <PageLink
        href={currentPage < totalPages ? hrefForPage(currentPage + 1) : null}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </PageLink>
    </nav>
  );
}

interface PageLinkProps {
  href: string | null;
  isActive?: boolean;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
  children: React.ReactNode;
}

function PageLink({
  href,
  isActive,
  children,
  "aria-label": ariaLabel,
  "aria-current": ariaCurrent,
}: PageLinkProps) {
  const baseCls =
    "inline-flex size-9 items-center justify-center rounded-lg text-sm transition-colors";
  if (href === null) {
    return (
      <span
        aria-label={ariaLabel}
        aria-current={ariaCurrent}
        className={cn(
          baseCls,
          isActive ? "bg-teal text-white" : "text-muted-foreground opacity-40",
        )}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        baseCls,
        "text-soft-black-light hover:bg-sage/10 focus-visible:ring-teal focus-visible:ring-2 focus-visible:outline-none",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Build a compact list of pages to render as clickable numbers:
 * - Always shows 1 and last page
 * - Shows current +/- 1
 * - Ellipsis where there's a gap
 */
function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [];
  pages.push(1);
  if (current > 3) pages.push("…");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}
