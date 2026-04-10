import { requireAuth } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { resetPassword } from "@/lib/auth/actions";
import { SettingsForm } from "./SettingsForm";

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

export default async function SettingsPage() {
  const user = await requireAuth();

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your notifications, password, and account.
        </p>
      </div>
      <div className="max-w-lg">
        <SettingsForm
          marketingOptOut={user.marketing_opt_out}
          onUpdateMarketing={updateMarketing}
          onChangePassword={changePassword}
        />
      </div>
    </div>
  );
}
