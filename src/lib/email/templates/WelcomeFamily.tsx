import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface WelcomeFamilyProps {
  firstName?: string;
}

export function WelcomeFamily({ firstName }: WelcomeFamilyProps) {
  return (
    <EmailLayout preview="Welcome to NurseDex! Find the right care for your family.">
      <Section>
        <Text style={heading}>
          Welcome to NurseDex{firstName ? `, ${firstName}` : ""}!
        </Text>
        <Text style={paragraph}>
          You have taken the first step toward finding quality care for your
          family in New York.
        </Text>
        <Text style={paragraph}>Here is how NurseDex works:</Text>
        <Text style={listItem}>
          <strong>1. Search</strong> for nurses by specialty, location,
          availability, and more.
        </Text>
        <Text style={listItem}>
          <strong>2. Save</strong> nurses you are interested in to your
          favorites list.
        </Text>
        <Text style={listItem}>
          <strong>3. Subscribe</strong> to access contact information and
          connect directly with nurses.
        </Text>
        <Text style={paragraph}>
          Every nurse on NurseDex is verified by our team, so you can feel
          confident in who you are contacting.
        </Text>
        <Link href="https://nursedex.com/dashboard" style={button}>
          Start Searching
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
