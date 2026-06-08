export type ImageAlign = "full" | "center" | "left" | "right";

/**
 * Tailwind classes for a body image's alignment, shared by the editor node
 * view and the public renderer so they look the same. Anything unrecognized
 * (including null) is full width. Pure, so it is unit testable.
 */
export function imageAlignClass(align: unknown): string {
  switch (align) {
    case "center":
      return "mx-auto w-2/3";
    case "left":
      return "float-left mr-6 mb-3 w-1/2";
    case "right":
      return "float-right ml-6 mb-3 w-1/2";
    default:
      return "w-full";
  }
}
