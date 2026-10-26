/**
 * Keeps React working on a page the browser has machine translated (#1240).
 *
 * Google Translate takes every text node out of the page and puts a pair of
 * `<font style="vertical-align: inherit;">` wrappers holding the translation
 * where it was. React still holds the original text node, now detached, so the
 * next time it removes that node, or inserts something in front of it, the
 * DOM throws NotFoundError and the whole screen is replaced by the error
 * boundary. That is NURSEDEX-SITE-19 and 1A: a Spanish speaking nurse in the
 * Google app pressed "Join NurseDex", the button put its spinner in front of
 * its own translated label, and the signup ended on our error page.
 *
 * Blocking translation (`translate="no"`) would stop it too, but about 40% of
 * visitors browse in Spanish, so the page tolerates translation instead. When
 * the node React names is no longer where React expects it, the call does the
 * nearest harmless thing rather than throw: a removal of a node that is already
 * gone is skipped, and an insertion whose reference is gone appends, so new
 * content still appears. The cost is that a translated string React meant to
 * replace can stay on screen, which beats an error page (L648).
 *
 * Every intervention is reported through onSkip, because this also hides any
 * genuine fault of ours with the same shape, and a guard nobody can see firing
 * is indistinguishable from one that never does.
 */
export type GuardedOperation = "removeChild" | "insertBefore";

type Restore = () => void;

let installed: { restore: Restore; count: number } | null = null;

export function installTranslationGuard(
  onSkip: (operation: GuardedOperation) => void,
): Restore {
  if (installed) {
    installed.count += 1;
    return release;
  }

  const proto = Node.prototype;
  const nativeRemoveChild = proto.removeChild;
  const nativeInsertBefore = proto.insertBefore;

  proto.removeChild = function removeChild<T extends Node>(
    this: Node,
    child: T,
  ): T {
    if (child.parentNode !== this) {
      onSkip("removeChild");
      return child;
    }
    return nativeRemoveChild.call(this, child) as T;
  };

  proto.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    node: T,
    child: Node | null,
  ): T {
    if (child && child.parentNode !== this) {
      onSkip("insertBefore");
      return nativeInsertBefore.call(this, node, null) as T;
    }
    return nativeInsertBefore.call(this, node, child) as T;
  };

  installed = {
    count: 1,
    restore: () => {
      proto.removeChild = nativeRemoveChild;
      proto.insertBefore = nativeInsertBefore;
    },
  };
  return release;
}

function release() {
  if (!installed) return;
  installed.count -= 1;
  if (installed.count > 0) return;
  installed.restore();
  installed = null;
}
