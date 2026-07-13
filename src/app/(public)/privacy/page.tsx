import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | NurseDex",
  description:
    "How NurseDex collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="bg-warm-white min-h-screen px-6 py-16">
      <article className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="font-heading text-teal hover:text-teal-dark mb-8 inline-block text-2xl transition-colors"
        >
          NurseDex
        </Link>

        <h1 className="font-heading text-soft-black text-3xl sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="font-body text-soft-black-light mt-2 text-sm">
          Last updated: July 13, 2026
        </p>

        <div className="font-body text-soft-black-light mt-10 space-y-8 leading-relaxed">
          <section>
            <h2 className="font-heading text-soft-black text-xl">Who we are</h2>
            <p className="mt-3">
              NurseDex LLC (&quot;NurseDex,&quot; &quot;we,&quot;
              &quot;us&quot;) operates nursedex.com, a directory connecting Long
              Island families with verified caregivers. You can reach us at{" "}
              <a
                href="mailto:support@nursedex.com"
                className="text-teal hover:text-teal-dark underline underline-offset-2"
              >
                support@nursedex.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-heading text-soft-black text-xl">
              What we collect
            </h2>
            <p className="mt-3">
              When you create an account, we collect your email address, name,
              role (family or nurse), and ZIP code. Nurses additionally provide
              the profile information they choose to share, such as credentials
              and license details, experience, languages, rates, and
              availability. If you use paid features, billing information is
              collected and processed by our payment provider; we do not store
              full card numbers. If you arrived through a referral link, we may
              also store the referral source so we can measure which channels
              are working.
            </p>
            <p className="mt-3">
              When you use the site, we collect standard analytics data: pages
              visited, browser type, device type, approximate location (country
              or region level), and interaction events such as button clicks. We
              do not collect precise geolocation.
            </p>
            <p className="mt-3">
              If you are signed in, this analytics data is linked to your
              account and your email address, so we can understand how real
              users move through the product rather than only counting anonymous
              visits. If you are signed out, it is not linked to you.
            </p>
            <p className="mt-3">
              We also record sessions: a replay of how a page looked and how you
              moved through it, so we can see where the product is confusing or
              broken. Recordings are masked. Anything you type into a form (your
              password, your phone number, a nurse&apos;s license number) is
              hidden from the recording, and so is personal information we
              display back to you, including a nurse&apos;s contact details once
              you have revealed them. We do not use recordings to read your
              personal data.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-soft-black text-xl">
              How we use your information
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                To create and operate your account, and to send you account,
                transactional, and important service updates.
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
            <h2 className="font-heading text-soft-black text-xl">
              Third-party services
            </h2>
            <p className="mt-3">
              We use trusted third-party service providers for hosting, database
              management, authentication, analytics, email delivery, error
              monitoring, and bot protection. These providers may process data
              on our behalf in accordance with their own privacy policies. We
              only share the minimum data necessary for each service to
              function.
            </p>
            <p className="mt-3">
              Our analytics and session recording are provided by PostHog. You
              can opt out of both by enabling &quot;Do Not Track&quot; in your
              browser: we check for it, and when it is on we do not load
              analytics at all. Not every browser still offers the setting, so
              if you would rather opt out and cannot, email{" "}
              <a
                href="mailto:support@nursedex.com"
                className="text-teal hover:underline"
              >
                support@nursedex.com
              </a>{" "}
              and we will do it for you.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-soft-black text-xl">Cookies</h2>
            <p className="mt-3">
              NurseDex uses minimal cookies. Our analytics provider may set a
              cookie to distinguish unique visitors. We do not use advertising
              cookies or cross-site tracking cookies. Essential cookies (such as
              session tokens when you log in) are required for the site to
              function.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-soft-black text-xl">
              Data retention
            </h2>
            <p className="mt-3">
              We retain your account information for as long as your account is
              active. You can ask us to delete your account and associated
              personal data at any time, and that includes the analytics profile
              and any session recordings linked to you.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-soft-black text-xl">
              Your rights
            </h2>
            <p className="mt-3">You can request to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>See what personal data we hold about you.</li>
              <li>Have your data corrected or deleted.</li>
              <li>Opt out of analytics tracking.</li>
              <li>Delete your account at any time.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{" "}
              <a
                href="mailto:support@nursedex.com"
                className="text-teal hover:text-teal-dark underline underline-offset-2"
              >
                support@nursedex.com
              </a>{" "}
              and we will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-soft-black text-xl">
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
            <h2 className="font-heading text-soft-black text-xl">
              Changes to this policy
            </h2>
            <p className="mt-3">
              We may update this privacy policy from time to time. If we make
              significant changes, we will notify registered users by email. The
              &quot;last updated&quot; date at the top of this page reflects the
              most recent revision.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-soft-black text-xl">Contact</h2>
            <p className="mt-3">
              Questions about this policy? Email{" "}
              <a
                href="mailto:support@nursedex.com"
                className="text-teal hover:text-teal-dark underline underline-offset-2"
              >
                support@nursedex.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="border-sage-light/40 mt-12 border-t pt-6">
          <Link
            href="/"
            className="font-body text-teal hover:text-teal-dark text-sm underline underline-offset-2"
          >
            Back to NurseDex
          </Link>
        </div>
      </article>
    </main>
  );
}
