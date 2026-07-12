import { requireAuth } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { resetPassword } from "@/lib/auth/actions";
import { updateFamilyContact } from "@/lib/family/actions";
import { getActiveSubscription } from "@/lib/subscriptions/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "./SettingsForm";
import { ManageSubscriptionCard } from "@/components/dashboard/ManageSubscriptionCard";
import { SignOutButton } from "@/components/auth/SignOutButton";

async function updateMarketing(optOut: boolean) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("users")
    .update({ marketing_opt_out: optOut })
    .eq("id", user.id);

  if (error) return { error: "Could not update preferences" };
  return {};
}

async function changePassword(formData: FormData) {
  "use server";
  return resetPassword(formData);
}

async function saveContact(formData: FormData) {
  "use server";
  return updateFamilyContact(formData);
}

export default async function SettingsPage() {
  const user = await requireAuth();
  const isFamily = user.role === "family";

  // Surface a billing card only when the user actually has a subscription to
  // manage. Free/never-subscribed users have no Stripe customer, so the
  // portal call would just error. Plan type is fixed by role: nurses can only
  // hold Featured, families only Family Access.
  const billingPlan = isFamily ? "family_access" : "nurse_featured";
  const subscription = await getActiveSubscription(user.id, billingPlan);
  const billingPlanLabel =
    billingPlan === "family_access" ? "Family Access" : "Featured";

  // For family, fetch the canonical zip/comm pref from family_profiles
  // (kept in sync with users.* by onboarding/settings updates).
  let familyContact:
    | {
        zip_code: string | null;
        communication_preference: string | null;
        phone: string | null;
      }
    | undefined;
  if (isFamily) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("family_profiles")
      .select("zip_code, communication_preference")
      .eq("user_id", user.id)
      .single();
    familyContact = {
      zip_code: data?.zip_code ?? user.zip_code ?? null,
      communication_preference:
        data?.communication_preference ?? user.communication_preference ?? null,
      phone: user.phone ?? null,
    };
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage your contact info, notifications, password, and account.
        </p>
      </div>
      <div className="max-w-lg space-y-6">
        <SettingsForm
          marketingOptOut={user.marketing_opt_out}
          onUpdateMarketing={updateMarketing}
          onChangePassword={changePassword}
          familyContact={familyContact}
          onSaveContact={isFamily ? saveContact : undefined}
        />

        {subscription && (
          <ManageSubscriptionCard
            planLabel={billingPlanLabel}
            title="Billing"
            returnTo="/dashboard/settings"
            renewsOn={subscription.current_period_end}
            cancelAtPeriodEnd={subscription.cancel_at_period_end}
            isPastDue={subscription.status === "past_due"}
          />
        )}

        <Card className="border-sage/20">
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <SignOutButton variant="button" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
