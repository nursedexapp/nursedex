import Link from "next/link";
import { cookies } from "next/headers";
import { PASSWORD_RECOVERY } from "@/lib/constants";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  const inRecovery =
    cookieStore.get(PASSWORD_RECOVERY.COOKIE_NAME)?.value === "1";

  if (!inRecovery) {
    return (
      <div>
        <div className="mb-8">
          <h2 className="font-heading text-2xl">Link invalid or expired</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            This password reset link is invalid or has expired. Reset links can
            only be opened once and are good for a short time.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="bg-teal text-warm-white hover:bg-teal-dark flex h-11 w-full items-center justify-center rounded-md text-base font-semibold transition-colors"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-heading text-2xl">Set new password</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose a new password for your account.
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
