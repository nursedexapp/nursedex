import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface VerificationApprovedProps {
  firstName?: string;
  slug: string;
}

export function VerificationApproved({
  firstName,
  slug,
}: VerificationApprovedProps) {
  const profileUrl = `https://nursedex.com/nurses/${slug}`;
  return (
    <EmailLayout preview="Your NurseDex license has been verified.">
      <Section>
        <Text style={heading}>
          You&apos;re verified{firstName ? `, ${firstName}` : ""}!
        </Text>
        <Text style={paragraph}>
          We confirmed your license against the NY State database. Your profile
          is now visible to families in New York, and you have a Verified
          badge on every search result and profile view.
        </Text>
        <Link href={profileUrl} style={button}>
          View your profile
        </Link>
        <Text style={paragraph}>
          A few things to do next: invite past clients to leave reviews, double
          check your photo and bio, and toggle availability when you&apos;re
          open to new clients.
        </Text>
        <Text style={footer}>
          Questions? Reply to this email or reach{" "}
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
