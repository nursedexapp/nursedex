import { Text, Section, Link } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

export function NewsletterWelcome() {
  return (
    <EmailLayout preview="Welcome to the NurseDex newsletter">
      <Section>
        <Text style={heading}>You are subscribed</Text>
        <Text style={paragraph}>
          Thanks for confirming. We will send occasional guides on home care and
          finding trusted nurses, and nothing else. No spam.
        </Text>
        <Text style={paragraph}>
          <Link href="https://nursedex.com/blog" style={link}>
            Read the latest posts
          </Link>
        </Text>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#2D3436",
  margin: "0 0 12px",
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const paragraph = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#2D3436",
  margin: "0 0 12px",
};
const link = { color: "#2A7B6F", textDecoration: "underline" };
