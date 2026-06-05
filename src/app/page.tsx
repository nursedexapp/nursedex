import { LandingPage } from "@/components/landing/LandingPage";
import { getWaitlistDisplayCount } from "@/lib/waitlist/queries";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const [params, waitlistCount] = await Promise.all([
    searchParams,
    getWaitlistDisplayCount(),
  ]);

  // Capture UTM parameters for waitlist attribution
  const utmParts = ["utm_source", "utm_medium", "utm_campaign"]
    .map((key) => {
      const val = params[key];
      return typeof val === "string" ? `${key}=${val}` : null;
    })
    .filter(Boolean);

  const referralSource = utmParts.length > 0 ? utmParts.join("&") : undefined;

  return (
    <LandingPage
      referralSource={referralSource}
      waitlistCount={waitlistCount}
    />
  );
}
