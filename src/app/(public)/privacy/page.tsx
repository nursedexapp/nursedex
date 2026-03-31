import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | NurseDex",
  description:
    "How NurseDex collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-warm-white px-6 py-16">
      <article className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="mb-8 inline-block font-heading text-2xl text-teal hover:text-teal-dark transition-colors"
        >
          NurseDex
        </Link>

        <h1 className="font-heading text-3xl text-soft-black sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 font-body text-sm text-soft-black-light">
          Last updated: March 31, 2026
        </p>

        <div className="mt-10 space-y-8 font-body text-soft-black-light leading-relaxed">
          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Who we are
            </h2>
            <p className="mt-3">
              NurseDex LLC (&quot;NurseDex,&quot; &quot;we,&quot;
              &quot;us&quot;) operates nursedex.com, a directory connecting Long
              Island families with verified caregivers. You can reach us at{" "}
              <a
                href="mailto:support@nursedex.com"
                className="text-teal underline underline-offset-2 hover:text-teal-dark"
              >
                support@nursedex.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              What we collect
            </h2>
            <p className="mt-3">
              When you join the waitlist, we collect your email address and the
              role you selected (family or caregiver). If you arrived through a
              referral link, we also store the referral source so we can measure
              which channels are working.
            </p>
            <p className="mt-3">
              When you use the site, we collect standard analytics data: pages
              visited, browser type, device type, approximate location (country
              or region level), and interaction events such as button clicks. We
              do not collect precise geolocation.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              How we use your information
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                To notify you when NurseDex launches or when we have important
                updates.
              </li>
              <li>
                To understand how visitors use the site so we can improve it.
              </li>
              <li>
                To measure the effectiveness of referral and marketing channels.
              </li>
              <li>To prevent abuse (spam signups, bot detection).</li>
            </ul>
            <p className="mt-3">
              We will never sell your email address or personal information to
              third parties.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Third-party services
            </h2>
            <p className="mt-3">
              We use trusted third-party service providers for hosting, database
              management, authentication, analytics, email delivery, error
              monitoring, and bot protection. These providers may process data on
              our behalf in accordance with their own privacy policies. We only
              share the minimum data necessary for each service to function.
            </p>
            <p className="mt-3">
              You can opt out of analytics tracking by enabling &quot;Do Not
              Track&quot; in your browser.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">Cookies</h2>
            <p className="mt-3">
              NurseDex uses minimal cookies. Our analytics provider may set a
              cookie to distinguish unique visitors. We do not use advertising
              cookies or cross-site tracking cookies. Essential cookies (such as
              session tokens when you log in) are required for the site to
              function.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Data retention
            </h2>
            <p className="mt-3">
              We retain your waitlist email until you ask us to remove it, or
              until you create a full account (at which point the waitlist entry
              is no longer needed). Analytics data is retained in aggregate form
              and is not linked to your identity after 90 days.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Your rights
            </h2>
            <p className="mt-3">You can request to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                See what personal data we hold about you.
              </li>
              <li>
                Have your data corrected or deleted.
              </li>
              <li>
                Opt out of analytics tracking.
              </li>
              <li>
                Withdraw from the waitlist at any time.
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{" "}
              <a
                href="mailto:support@nursedex.com"
                className="text-teal underline underline-offset-2 hover:text-teal-dark"
              >
                support@nursedex.com
              </a>{" "}
              and we will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Children&apos;s privacy
            </h2>
            <p className="mt-3">
              NurseDex is not intended for children under 18. We do not
              knowingly collect personal information from minors. If you believe
              a minor has submitted information to us, please contact us and we
              will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Changes to this policy
            </h2>
            <p className="mt-3">
              We may update this privacy policy from time to time. If we make
              significant changes, we will notify waitlist members by email. The
              &quot;last updated&quot; date at the top of this page reflects the
              most recent revision.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">Contact</h2>
            <p className="mt-3">
              Questions about this policy? Email{" "}
              <a
                href="mailto:support@nursedex.com"
                className="text-teal underline underline-offset-2 hover:text-teal-dark"
              >
                support@nursedex.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-sage-light/40 pt-6">
          <Link
            href="/"
            className="font-body text-sm text-teal underline underline-offset-2 hover:text-teal-dark"
          >
            Back to NurseDex
          </Link>
        </div>
      </article>
    </main>
  );
}
