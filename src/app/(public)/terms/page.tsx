import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | NurseDex",
  description: "Terms and conditions for using the NurseDex platform.",
};

export default function TermsOfServicePage() {
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
          Terms of Service
        </h1>
        <p className="mt-2 font-body text-sm text-soft-black-light">
          Last updated: March 31, 2026
        </p>

        <div className="mt-10 space-y-8 font-body text-soft-black-light leading-relaxed">
          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Agreement to terms
            </h2>
            <p className="mt-3">
              By accessing or using nursedex.com (&quot;the Site&quot;), you
              agree to be bound by these Terms of Service. If you do not agree,
              do not use the Site. NurseDex LLC (&quot;NurseDex,&quot;
              &quot;we,&quot; &quot;us&quot;) reserves the right to update these
              terms at any time. Continued use of the Site after changes
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              What NurseDex is
            </h2>
            <p className="mt-3">
              NurseDex is a directory platform that connects Long Island families
              with caregivers (HHAs, CNAs, LPNs, RNs, and NPs). We provide a
              space for caregivers to create profiles and for families to
              discover, review, and contact them.
            </p>
            <p className="mt-3">
              NurseDex is not an employer, staffing agency, or healthcare
              provider. We do not employ, supervise, or control any caregiver
              listed on the platform. All care arrangements are made directly
              between families and caregivers. We are not a party to those
              arrangements.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Waitlist
            </h2>
            <p className="mt-3">
              Joining the waitlist is free and does not obligate you to use
              NurseDex when it launches. By joining, you consent to receiving
              email communications about the NurseDex launch and related
              updates. You may unsubscribe at any time by emailing{" "}
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
              Eligibility
            </h2>
            <p className="mt-3">
              You must be at least 18 years old to use NurseDex. By using the
              Site, you represent that you meet this requirement. Caregivers who
              create profiles must hold valid credentials for the role they
              claim. Providing false credential information is grounds for
              immediate removal from the platform.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Accounts and profiles
            </h2>
            <p className="mt-3">
              When NurseDex launches, users will create accounts to access the
              platform. You are responsible for keeping your login credentials
              secure. You agree to notify us immediately if you suspect
              unauthorized access to your account.
            </p>
            <p className="mt-3">
              Caregiver profiles must contain accurate, truthful information.
              NurseDex reserves the right to verify credentials and remove
              profiles that contain false or misleading information.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Payments and refunds
            </h2>
            <p className="mt-3">
              Families will pay a monthly subscription to unlock caregiver
              contact information. Caregivers can create profiles for free, with
              optional paid upgrades for featured placement in search results.
            </p>
            <p className="mt-3">
              All payments are processed through Stripe. Subscription details
              and pricing will be published before launch. All sales are final.
              NurseDex does not offer refunds.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Reviews and content
            </h2>
            <p className="mt-3">
              Families may leave reviews on caregiver profiles. Reviews must be
              honest, based on real experience, and free of harassment,
              discrimination, or personal attacks. NurseDex reserves the right to
              moderate, edit, or remove reviews that violate these standards.
            </p>
            <p className="mt-3">
              By posting a review or any content on NurseDex, you grant us a
              non-exclusive, royalty-free license to display that content on the
              platform.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Prohibited conduct
            </h2>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                Use the Site for any unlawful purpose.
              </li>
              <li>
                Impersonate another person or misrepresent your credentials.
              </li>
              <li>
                Scrape, harvest, or collect information from the Site using
                automated tools without written permission.
              </li>
              <li>
                Interfere with the security or proper functioning of the Site.
              </li>
              <li>
                Post spam, solicitations, or commercial content unrelated to
                caregiving services.
              </li>
              <li>
                Harass, threaten, or discriminate against any user.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Disclaimer of warranties
            </h2>
            <p className="mt-3">
              NurseDex is provided &quot;as is&quot; and &quot;as
              available.&quot; We do not guarantee the accuracy of caregiver
              profiles, reviews, or credentials beyond our stated verification
              process. We do not guarantee the quality, safety, or outcome of
              any care arrangement made through the platform.
            </p>
            <p className="mt-3">
              Families are responsible for conducting their own due diligence
              before hiring a caregiver, including background checks,
              interviews, and reference verification.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Limitation of liability
            </h2>
            <p className="mt-3">
              To the maximum extent permitted by law, NurseDex LLC shall not be
              liable for any indirect, incidental, special, consequential, or
              punitive damages arising from your use of the Site or any care
              arrangement facilitated through it. Our total liability to you for
              any claim shall not exceed the amount you paid to NurseDex in the
              12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Termination
            </h2>
            <p className="mt-3">
              We may suspend or terminate your access to NurseDex at any time,
              for any reason, with or without notice. This includes removal of
              caregiver profiles that violate our terms. Upon termination, your
              right to use the Site ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">
              Governing law
            </h2>
            <p className="mt-3">
              These terms are governed by the laws of the State of New York. Any
              disputes arising from these terms or your use of NurseDex shall be
              resolved in the courts of Suffolk County, New York.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl text-soft-black">Contact</h2>
            <p className="mt-3">
              Questions about these terms? Email{" "}
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
