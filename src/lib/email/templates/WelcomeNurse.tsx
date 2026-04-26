import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface WelcomeNurseProps {
  firstName?: string;
}

export function WelcomeNurse({ firstName }: WelcomeNurseProps) {
  return (
    <EmailLayout preview="Welcome to NurseDex! Let's get your profile set up.">
      <Section>
        <Text style={heading}>
          Welcome to NurseDex{firstName ? `, ${firstName}` : ""}!
        </Text>
        <Text style={paragraph}>
          We are excited to have you join our community of healthcare
          professionals on Long Island.
        </Text>
        <Text style={paragraph}>Here is what to do next:</Text>
        <Text style={listItem}>
          <strong>1. Complete your profile</strong> with your credentials,
          experience, and a professional photo.
        </Text>
        <Text style={listItem}>
          <strong>2. Get verified</strong> by our team (usually within 24-72
          hours).
        </Text>
        <Text style={listItem}>
          <strong>3. Start connecting</strong> with families who need your
          expertise.
        </Text>
        <Text style={paragraph}>
          Once verified, your profile will be visible to families searching for
          care in your area.
        </Text>
        <Link href="https://nursedex.com/dashboard" style={button}>
          Complete Your Profile
        </Link>
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

const listItem = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#2D3436",
  margin: "0 0 8px",
  paddingLeft: "8px",
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
