import { permanentRedirect } from "next/navigation";

// /welcome was the marketing homepage before launch; it is now the site root
// (/). Keep this path as a permanent redirect so the previously indexed URL and
// any old links resolve instead of 404ing.
export default function WelcomePage() {
  permanentRedirect("/");
}
