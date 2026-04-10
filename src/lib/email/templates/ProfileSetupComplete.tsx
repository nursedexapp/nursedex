import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface ProfileSetupCompleteProps {
  firstName?: string;
  slug: string;
}

export function ProfileSetupComplete({
  firstName,
  slug,
}: ProfileSetupCompleteProps) {
  const profileUrl = `https://nursedex.com/nurses/${slug}`;

  return (
    <EmailLayout preview="Your NurseDex profile is ready! Invite past clients to leave reviews.">
      <Section>
        <Text style={heading}>
          Your profile is live{firstName ? `, ${firstName}` : ""}!
        </Text>
        <Text style={paragraph}>
          Great work setting up your NurseDex profile. Once our team verifies
          your license, families on Long Island will be able to find you.
        </Text>
        <Text style={paragraph}>
          <strong>Want to stand out?</strong> Nurses with reviews get noticed
          first. Invite past clients to share their experience with you.
        </Text>
        <Text style={paragraph}>
          Share this link with anyone you have worked with:
        </Text>
        <Link href={profileUrl} style={button}>
          View Your Profile
        </Link>
        <Text style={paragraph}>
          You can also copy your review invitation link from your dashboard at
          any time.
        </Text>
        <Text style={footer}>
          Questions? Reply to this email or reach out at{" "}
          <Link href="mailto:support@nursedex.com" style={link}>
            support@nursedex.com
          </Link>
        </Text>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "24px",
  fontWeight: 700,
  color: "#2D3436",
  margin: "0 0 16px",
  fontFamily: "Georgia, 'Times New Roman', serif",
};

const paragraph = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#2D3436",
  margin: "0 0 12px",
};

const button = {
  display: "inline-block",
  backgroundColor: "#2A7B6F",
  color: "#FFFFFF",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "8px",
  margin: "16px 0",
};

const link = {
  color: "#2A7B6F",
  textDecoration: "underline",
};

const footer = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#636E72",
  margin: "24px 0 0",
};
