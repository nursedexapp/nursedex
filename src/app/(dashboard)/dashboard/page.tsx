import { requireAuth } from "@/lib/auth/helpers";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-warm-white p-8">
      <div className="max-w-2xl mx-auto">
        <Card className="border-sage/20">
          <CardHeader>
            <CardTitle>Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Signed in as <strong>{user.email}</strong>
            </p>
            <p className="text-sm text-muted-foreground">
              Role: <strong>{user.role || "Not set"}</strong>
            </p>
            <form action={signOut}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
