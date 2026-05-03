import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase } from "lucide-react";
import { requireAuth } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { HireDecisionButtons } from "@/components/hires/HireDecisionButtons";

export const metadata: Metadata = {
  title: "Confirm a hire | NurseDex",
  robots: { index: false, follow: false },
};

interface ConfirmHirePageProps {
  params: Promise<{ token: string }>;
}

export default async function ConfirmHirePage({
  params,
}: ConfirmHirePageProps) {
  const { token } = await params;
  const user = await requireAuth();

  if (user.role !== "family") {
    redirect("/");
  }

  const supabase = await createClient();
  const { data: hire } = await supabase
    .from("hires")
    .select("id, status, family_user_id, nurse_user_id")
    .eq("claim_token", token)
    .maybeSingle();

  type HireRow = {
    id: string;
    status: "claimed" | "confirmed" | "rejected";
    family_user_id: string;
    nurse_user_id: string;
  } | null;
  const row = hire as HireRow;

  // Token isn't valid for this user, or doesn't exist anymore.
  if (!row || row.family_user_id !== user.id) {
    return (
      <Layout>
        <Card className="border-sage/20">
          <CardContent className="space-y-3 py-8 text-center">
            <Briefcase className="text-muted-foreground mx-auto size-10" />
            <h1 className="font-heading text-soft-black text-xl font-semibold">
              Link not valid
            </h1>
            <p className="text-soft-black-light text-sm">
              This confirmation link doesn&apos;t match your account, or it
              has already been used. If you think this is wrong, reach{" "}
              <Link
                href="mailto:support@nursedex.com"
                className="text-teal hover:underline"
              >
                support@nursedex.com
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  // Already resolved.
  if (row.status !== "claimed") {
    return (
      <Layout>
        <Card className="border-sage/20">
          <CardContent className="space-y-3 py-8 text-center">
            <Briefcase className="text-muted-foreground mx-auto size-10" />
            <h1 className="font-heading text-soft-black text-xl font-semibold">
              Already handled
            </h1>
            <p className="text-soft-black-light text-sm">
              You already{" "}
              {row.status === "confirmed" ? "confirmed" : "rejected"} this
              hire request.
            </p>
            <p>
              <Link
                href="/dashboard"
                className="text-teal text-sm hover:underline"
              >
                Go to dashboard
              </Link>
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  // Look up the nurse's first name for context.
  const service = createServiceRoleClient();
  const { data: nurseUser } = await service
    .from("users")
    .select("first_name, last_name")
    .eq("id", row.nurse_user_id)
    .maybeSingle();
  const nurseName = nurseUser
    ? `${nurseUser.first_name ?? ""} ${nurseUser.last_name ?? ""}`.trim() ||
      "this nurse"
    : "this nurse";

  return (
    <Layout>
      <Card className="border-sage/20">
        <CardContent className="space-y-4 pt-6">
          <Briefcase className="text-teal size-8" />
          <h1 className="font-heading text-soft-black text-xl font-semibold">
            Did you hire {nurseName}?
          </h1>
          <p className="text-soft-black-light text-sm">
            {nurseName} let us know they were hired by you on NurseDex.
            We&apos;d love to confirm before showing it on their profile.
          </p>
          <HireDecisionButtons token={token} />
        </CardContent>
      </Card>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-warm-white flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        {children}
      </main>
      <Footer />
    </div>
  );
}
