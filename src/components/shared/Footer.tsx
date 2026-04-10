import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-sage-light/50 bg-warm-white px-6 py-12">
      <div className="mx-auto max-w-6xl text-center">
        <Link href="/" className="font-heading text-2xl text-teal">
          NurseDex
        </Link>
        <p className="mt-1 font-body text-sm text-soft-black-light">
          Long Island&apos;s trusted nurse directory.
        </p>

        <a
          href="mailto:support@nursedex.com"
          className="mt-4 inline-block font-body text-sm text-soft-black-light underline underline-offset-2 hover:text-soft-black"
        >
          support@nursedex.com
        </a>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-body text-xs text-soft-black-light/70">
          <span>&copy; {year} NurseDex LLC</span>
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-soft-black"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="underline underline-offset-2 hover:text-soft-black"
          >
            Terms of Service
          </Link>
        </div>
      </div>
    </footer>
  );
}
