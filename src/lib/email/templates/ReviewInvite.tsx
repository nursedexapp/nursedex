import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface ReviewInviteProps {
  firstName?: string;
  reviewLinkUrl: string;
}

export function ReviewInvite({
  firstName,
  reviewLinkUrl,
}: ReviewInviteProps) {
  return (
    <EmailLayout preview="Reviews build trust on NurseDex. Here's your share link.">
      <Section>
        <Text style={heading}>
          Build trust with reviews{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          You&apos;ve been verified on NurseDex for a few weeks now. Nurses
          with reviews show up higher in search and get hired faster, so
          here&apos;s your share link to invite past clients.
        </Text>
        <Link href={reviewLinkUrl} style={button}>
          Open my review link
        </Link>
        <Text style={paragraph}>
          Send this to families you&apos;ve worked with by text or email.
          They don&apos;t need a NurseDex account to leave you a review;
          we just verify the email address before publishing.
        </Text>
        <Text style={footer}>
          Want to opt out of these nudges? Adjust your notification
          settings on{" "}
          <Link
            href="https://nursedex.com/dashboard/settings"
            style={link}
          >
            your dashboard
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
