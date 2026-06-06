import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact | NurseDex",
  description:
    "Get in touch with the NurseDex team. We typically reply within one business day.",
  openGraph: {
    title: "Contact NurseDex",
    description: "Get in touch with the NurseDex team.",
    type: "website",
    url: "https://nursedex.com/contact",
  },
};

export default function ContactPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <header className="mb-8">
          <h1 className="font-heading text-soft-black text-3xl font-semibold">
            Contact us
          </h1>
          <p className="text-soft-black-light mt-2 text-base">
            Questions, feedback, or something specific to flag? Drop a message
            below. We typically reply within one business day.
          </p>
        </header>

        <Card className="border-sage/20">
          <CardContent className="pt-6">
            <ContactForm />
          </CardContent>
        </Card>

        <div className="mt-8">
          <h2 className="font-heading text-soft-black text-lg font-semibold">
            Other ways to reach us
          </h2>
          <ul className="text-soft-black-light mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="text-teal size-4" />
              <a href="mailto:support@nursedex.com" className="hover:underline">
                support@nursedex.com
              </a>
            </li>
            <li>
              For account-specific questions, sign in and reach out from{" "}
              <Link
                href="/dashboard/settings"
                className="text-teal underline underline-offset-2"
              >
                your dashboard settings
              </Link>{" "}
              so we can pull up your account.
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
