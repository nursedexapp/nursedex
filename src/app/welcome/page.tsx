import { redirect } from "next/navigation";

// The homepage now lives at "/" (see src/app/page.tsx). Keep this route as a
// permanent redirect so any existing /welcome links still land on the home
// page instead of 404ing.
export default function WelcomePage() {
  redirect("/");
}
