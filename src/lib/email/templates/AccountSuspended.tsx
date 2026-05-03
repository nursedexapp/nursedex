import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface AccountSuspendedProps {
  firstName?: string;
}

export function AccountSuspended({ firstName }: AccountSuspendedProps) {
  return (
    <EmailLayout preview="Your NurseDex account has been temporarily suspended.">
      <Section>
        <Text style={heading}>
          Your account is suspended{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          We&apos;ve temporarily paused your NurseDex account while our team
          looks into a concern. During this time:
        </Text>
        <Text style={paragraph}>
          - Your profile is hidden from families and search results
          <br />
          - You can&apos;t log in
          <br />
          - Your data is preserved and nothing is deleted
        </Text>
        <Text style={paragraph}>
          We&apos;ll be in touch with next steps. If you have questions or
          want to discuss this directly, please reach out below.
        </Text>
        <Text style={footer}>
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
