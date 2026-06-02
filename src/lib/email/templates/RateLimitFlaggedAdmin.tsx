import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface RateLimitFlaggedAdminProps {
  flaggedCount: number;
}

export function RateLimitFlaggedAdmin({
  flaggedCount,
}: RateLimitFlaggedAdminProps) {
  return (
    <EmailLayout
      preview={`${flaggedCount} family account${flaggedCount === 1 ? "" : "s"} hit consecutive captcha days.`}
    >
      <Section>
        <Text style={heading}>Rate limit flagged accounts</Text>
        <Text style={paragraph}>
          {`${flaggedCount} family account${flaggedCount === 1 ? "" : "s"} ${flaggedCount === 1 ? "has" : "have"} hit 3 or more consecutive captcha trigger days on the reveal flow. Worth a manual look in case any are scraping.`}
        </Text>
        <Link
          href="https://nursedex.com/admin/accounts?tab=flagged"
          style={button}
        >
          Open flagged list
        </Link>
        <Text style={footer}>
          You&apos;re a NurseDex admin. Reply to flag a false positive or reach{" "}
          <Link href="mailto:support@nursedex.com" style={link}>
            support@nursedex.com
          </Link>
          .
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
const link = { color: "#2A7B6F", textDecoration: "underline" };
const footer = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#636E72",
  margin: "24px 0 0",
};
