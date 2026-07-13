"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { stalledMessageFor } from "@/components/ui/stalled-copy";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { usePendingPhase } from "@/components/ui/pending-button";
import { useInFlight } from "@/components/ui/use-in-flight";
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

/**
 * Which of the three dialogs is up, and what it is about to act on.
 *
 * One piece of state, not three booleans: only ever one dialog is open, and the
 * rename needed a real text field anyway (it was a window.prompt, #674).
 */
type TaxonomyDialog =
  | { kind: "rename"; cfg: SectionConfig; item: Item }
  | { kind: "merge"; cfg: SectionConfig; item: Item; target: Item }
  | { kind: "delete"; cfg: SectionConfig; item: Item };

export function TaxonomyManager({
  categories,
  tags,
}: {
  categories: CategoryWithCount[];
  tags: TagWithCount[];
}) {
  const router = useRouter();
  // Keyed by row id. A single flag disabled EVERY row at once and spun EVERY
  // row's menu, so an admin deleting one tag watched the whole page seize with
  // no way to tell which row was actually working.
  const { inFlight, busy, run } = useInFlight<string>();
  const [dialog, setDialog] = useState<TaxonomyDialog | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { phase } = usePendingPhase({ pending: busy });
  // While a dialog is up, the PendingButton inside it owns the stall alert.
  // Rendering the list's alert too would put two on screen for one action.
  const stalled = phase === "stalled" && !dialog;
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stalled) requestAnimationFrame(() => alertRef.current?.focus());
  }, [stalled]);

  function openDialog(next: TaxonomyDialog) {
    if (next.kind === "rename") setRenameValue(next.item.name);
    setDialog(next);
  }

  function act(
    id: string,
    fn: () => Promise<TaxonomyResult>,
    successMsg: string,
  ) {
    run(id, async () => {
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
      setDialog(null);
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
                      disabled={busy}
                      className="hover:bg-muted text-soft-black-light inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
                    >
                      {inFlight === item.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="size-4" />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          openDialog({ kind: "rename", cfg, item })
                        }
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
                                  onClick={() =>
                                    openDialog({
                                      kind: "merge",
                                      cfg,
                                      item,
                                      target: o,
                                    })
                                  }
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
                        onClick={() =>
                          openDialog({ kind: "delete", cfg, item })
                        }
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
      {/* wait, not retry (#443 phase 4). Deleting or merging rewrites every post
          that used the term, so a stall never hands the menu back. Icons cannot
          carry the stall panel, so one alert speaks for the list. */}
      {stalled && (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="bg-error/10 text-error rounded-lg px-4 py-3 text-sm outline-none"
        >
          {stalledMessageFor("wait")}
        </div>
      )}
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

      {/* One dialog for all three actions, and a SIBLING of the menus rather
          than a child of one: a dialog rendered inside a menu is unmounted the
          moment the menu closes, so it would flash and vanish. */}
      {dialog && (
        <TaxonomyDialogContent
          dialog={dialog}
          busy={busy}
          renameValue={renameValue}
          onRenameChange={setRenameValue}
          onClose={() => setDialog(null)}
          onConfirm={confirmDialog}
          plural={plural}
        />
      )}
    </div>
  );

  function confirmDialog() {
    if (!dialog) return;
    const { cfg, item } = dialog;

    if (dialog.kind === "rename") {
      const name = renameValue.trim();
      if (!name || name === item.name) return;
      act(item.id, () => cfg.onRename(item.id, name), `Renamed to ${name}.`);
      return;
    }

    if (dialog.kind === "merge") {
      const { target } = dialog;
      act(
        item.id,
        () => cfg.onMerge(item.id, target.id),
        `Merged into ${target.name}.`,
      );
      return;
    }

    act(item.id, () => cfg.onDelete(item.id), "Deleted.");
  }
}

function TaxonomyDialogContent({
  dialog,
  busy,
  renameValue,
  onRenameChange,
  onClose,
  onConfirm,
  plural,
}: {
  dialog: TaxonomyDialog;
  busy: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  plural: (n: number) => string;
}) {
  const { cfg, item } = dialog;
  const used =
    item.postCount > 0
      ? `${item.postCount} ${plural(item.postCount)}`
      : `no posts`;

  const shared = {
    open: true,
    onOpenChange: (next: boolean) => {
      if (!next) onClose();
    },
    pending: busy,
    onConfirm,
    outcome:
      dialog.kind === "rename"
        ? "the new name was saved"
        : dialog.kind === "merge"
          ? "the merge went through"
          : "it was deleted",
  };

  if (dialog.kind === "rename") {
    const name = renameValue.trim();
    return (
      <ConfirmDialog
        {...shared}
        title={`Rename ${item.name}`}
        description={`The web address changes to match the new name. The old address keeps working: it redirects to the new one, so nothing you have already shared breaks.`}
        confirmLabel={`Rename ${cfg.label}`}
        workingLabel="Renaming..."
        slowLabel="Still renaming..."
        confirmVariant="default"
        confirmDisabled={!name || name === item.name}
      >
        <div>
          <Label htmlFor="taxonomy_name" className="mb-1.5 block">
            New name
          </Label>
          <Input
            id="taxonomy_name"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            disabled={busy}
            autoFocus
            required
          />
        </div>
      </ConfirmDialog>
    );
  }

  if (dialog.kind === "merge") {
    const { target } = dialog;
    return (
      <ConfirmDialog
        {...shared}
        title={`Merge ${item.name} into ${target.name}?`}
        description={`Every post using ${item.name} (${used}) is moved over to ${target.name}, and ${item.name} itself is removed. This cannot be undone: you would have to recreate it and re-tag the posts by hand.`}
        confirmLabel={`Merge into ${target.name}`}
        workingLabel="Merging..."
        slowLabel="Still merging..."
      />
    );
  }

  return (
    <ConfirmDialog
      {...shared}
      title={`Delete ${item.name}?`}
      description={
        item.postCount > 0
          ? `This removes the ${cfg.label} for good. The ${used} using it are ${cfg.orphanVerb}: the posts themselves are not deleted.`
          : `This removes the ${cfg.label} for good. No posts are using it.`
      }
      confirmLabel={`Delete ${cfg.label}`}
      workingLabel="Deleting..."
      slowLabel="Still deleting..."
    />
  );
}
