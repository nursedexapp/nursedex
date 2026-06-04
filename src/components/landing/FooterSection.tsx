import Link from "next/link";

export function FooterSection() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-sage-light/50 bg-warm-white border-t px-6 py-12">
      <div className="mx-auto max-w-4xl text-center">
        <p className="font-heading text-teal text-2xl">NurseDex</p>
        <p className="font-body text-soft-black-light mt-1 text-sm">
          New York&apos;s trusted nurse directory.
        </p>

        <a
          href="mailto:support@nursedex.com"
          className="font-body text-soft-black-light hover:text-soft-black mt-4 inline-block text-sm underline underline-offset-2"
        >
          support@nursedex.com
        </a>

        <div className="font-body text-soft-black-light mt-6 flex items-center justify-center gap-6 text-xs">
          <span>&copy; {year} NurseDex</span>
          <Link
            href="/privacy"
            className="hover:text-soft-black underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hover:text-soft-black underline underline-offset-2"
          >
            Terms of Service
          </Link>
        </div>
      </div>
    </footer>
  );
}
