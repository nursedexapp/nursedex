import Link from "next/link";
import { SocialLinks } from "@/components/shared/SocialLinks";

interface FooterProps {
  /**
   * The copyright year, resolved by the caller through `currentYear()` (#566).
   * Taken as a prop rather than read from the clock here, so the value is
   * computed once on the server and cannot differ between the HTML that is
   * sent and the tree the browser hydrates.
   */
  year: number;
}

export function Footer({ year }: FooterProps) {

  return (
    <footer className="border-sage-light/50 bg-warm-white border-t px-6 py-12">
      <div className="max-w-site mx-auto text-center">
        <Link href="/" className="font-heading text-teal text-2xl">
          NurseDex
        </Link>
        <p className="font-body text-soft-black-light mt-1 text-sm">
          New York&apos;s trusted nurse directory.
        </p>

        <a
          href="mailto:support@nursedex.com"
          className="font-body text-soft-black-light hover:text-soft-black mt-4 inline-block text-sm underline underline-offset-2"
        >
          support@nursedex.com
        </a>

        <SocialLinks className="mt-6 justify-center" />

        <div className="font-body text-soft-black-light mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
          <span>&copy; {year} NurseDex LLC</span>
          <Link
            href="/blog"
            className="hover:text-soft-black underline underline-offset-2"
          >
            Blog
          </Link>
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
          <Link
            href="/attributions"
            className="hover:text-soft-black underline underline-offset-2"
          >
            Data attributions
          </Link>
        </div>
      </div>
    </footer>
  );
}
