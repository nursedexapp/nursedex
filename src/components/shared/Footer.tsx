import Link from "next/link";
import { SocialLinks } from "@/components/shared/SocialLinks";

/**
 * The site's public pages, in the order a visitor is most likely to want them.
 *
 * This row is what makes the marketing pages reachable at all. Before #1042 the
 * footer carried only Blog beside the legal links, so /pricing, /about, /faq
 * and /contact had no route in from any public page: /pricing was linked from
 * three dashboard surfaces, which a visitor who has not signed up never sees,
 * and /contact only from /about and /faq, which were themselves unreachable.
 *
 * Ordered for the reader rather than by the shape of the routes (L609): the
 * directory and the paid plans first, because those are what somebody is here
 * to do, and the explanatory pages behind them. `public-route-reachability.test`
 * fails if a public page loses its last way in.
 */
const SITE_LINKS = [
  { href: "/nurses", label: "Find a Nurse" },
  { href: "/pricing", label: "Pricing" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

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

        <nav
          aria-label="Footer"
          className="font-body text-soft-black mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm"
        >
          {SITE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-teal underline-offset-4 hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="font-body text-soft-black-light mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
          <span>&copy; {year} NurseDex LLC</span>
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
