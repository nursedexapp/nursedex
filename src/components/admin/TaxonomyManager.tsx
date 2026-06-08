"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  renameCategory,
  renameTag,
  deleteCategory,
  deleteTag,
  mergeCategory,
  mergeTag,
  type TaxonomyResult,
} from "@/lib/blog/taxonomy-actions";
import type { CategoryWithCount, TagWithCount } from "@/lib/blog/queries";

interface Item {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

interface SectionConfig {
  title: string;
  label: string; // "category" | "tag"
  orphanVerb: string; // what happens to posts on delete
  items: Item[];
  onRename: (id: string, name: string) => Promise<TaxonomyResult>;
  onDelete: (id: string) => Promise<TaxonomyResult>;
  onMerge: (sourceId: string, targetId: string) => Promise<TaxonomyResult>;
}

export function TaxonomyManager({
  categories,
  tags,
}: {
  categories: CategoryWithCount[];
  tags: TagWithCount[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<TaxonomyResult>, successMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.success) {
        toast.error(
          res.error === "duplicate"
            ? "That name is already in use."
            : "Something went wrong. Please try again.",
        );
        return;
      }
      toast.success(successMsg);
      router.refresh();
    });
  }

  function plural(n: number) {
    return n === 1 ? "post" : "posts";
  }

  function section(cfg: SectionConfig) {
    return (
      <section>
        <h2 className="font-heading text-soft-black mb-3 text-lg font-semibold">
          {cfg.title}
        </h2>
        {cfg.items.length === 0 ? (
          <p className="text-soft-black-light text-sm">None yet.</p>
        ) : (
          <div className="space-y-2">
            {cfg.items.map((item) => (
              <Card key={item.id} className="border-sage/20">
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-soft-black font-medium">{item.name}</p>
                    <p className="text-soft-black-light text-xs">
                      /{item.slug} &middot; {item.postCount}{" "}
                      {plural(item.postCount)}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`${item.name} actions`}
                      disabled={pending}
                      className="hover:bg-muted text-soft-black-light inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
                    >
                      {pending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="size-4" />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          const name = window.prompt(
                            `Rename ${cfg.label}`,
                            item.name,
                          );
                          if (
                            name &&
                            name.trim() &&
                            name.trim() !== item.name
                          ) {
                            act(
                              () => cfg.onRename(item.id, name),
                              `Renamed to ${name.trim()}.`,
                            );
                          }
                        }}
                      >
                        Rename
                      </DropdownMenuItem>
                      {cfg.items.length > 1 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            Merge into
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {cfg.items
                              .filter((o) => o.id !== item.id)
                              .map((o) => (
                                <DropdownMenuItem
                                  key={o.id}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Merge "${item.name}" into "${o.name}"? "${item.name}" will be removed.`,
                                      )
                                    ) {
                                      act(
                                        () => cfg.onMerge(item.id, o.id),
                                        `Merged into ${o.name}.`,
                                      );
                                    }
                                  }}
                                >
                                  {o.name}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          const note =
                            item.postCount > 0
                              ? ` It is used by ${item.postCount} ${plural(item.postCount)}, which will be ${cfg.orphanVerb}.`
                              : "";
                          if (window.confirm(`Delete "${item.name}"?${note}`)) {
                            act(() => cfg.onDelete(item.id), "Deleted.");
                          }
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-10">
      {section({
        title: "Categories",
        label: "category",
        orphanVerb: "left uncategorized",
        items: categories,
        onRename: renameCategory,
        onDelete: deleteCategory,
        onMerge: mergeCategory,
      })}
      {section({
        title: "Tags",
        label: "tag",
        orphanVerb: "untagged",
        items: tags,
        onRename: renameTag,
        onDelete: deleteTag,
        onMerge: mergeTag,
      })}
    </div>
  );
}
