import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found | NurseDex",
  robots: { index: false, follow: true },
};

// Scoped to the (admin) group so a notFound() from an admin route renders
// only the 404 content inside the admin layout (sidebar), instead of falling
// through to the root not-found and rendering the public header/footer.
export default function AdminNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-teal font-mono text-sm font-medium tracking-wider">
        404
      </p>
      <h1 className="font-heading text-soft-black mt-2 text-3xl font-semibold sm:text-4xl">
        This page took the day off
      </h1>
      <p className="text-soft-black-light mt-3 max-w-md text-base">
        We can&apos;t find what you&apos;re looking for. It might have moved, or
        you might have followed an old link.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/admin"
          className="bg-teal hover:bg-teal-dark inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          Back to admin
        </Link>
      </div>
    </div>
  );
}
