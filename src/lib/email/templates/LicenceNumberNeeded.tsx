import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface LicenceNumberNeededProps {
  firstName?: string;
}

/**
 * Sent once to a nurse who was verified without a licence number on file
 * (#912).
 *
 * It is deliberately NOT the verification rejected email, which says "our team
 * checked your license against the NY State database and ran into the
 * following issue". Nobody checked anything: there was no number to check, and
 * saying otherwise to 25 real people would be a false account of what we did.
 *
 * The tone follows from that. This is our omission, not hers, and the email
 * says so before it asks her for anything.
 */
export function LicenceNumberNeeded({ firstName }: LicenceNumberNeededProps) {
  return (
    <EmailLayout preview="We need your license number to keep your NurseDex profile verified.">
      <Section>
        <Text style={heading}>
          We need your license number{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          Your profile was verified without a license number on file, which is
          our mistake rather than yours. We check every Home Health Aide license
          against the New York State register, and we cannot do that without the
          number.
        </Text>
        <Text style={paragraph}>
          So your verification is paused until you add it. It takes a minute:
          open your profile, put your license number in, and we will check it
          and put your badge back.
        </Text>
        <Link href="https://nursedex.com/dashboard/edit" style={button}>
          Add your license number
        </Link>
        <Text style={footer}>
          If you have any trouble, or you think we have this wrong, reply to
          this email or reach us at{" "}
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
  margin: "0 0 16px",
};

const button = {
  display: "inline-block",
  backgroundColor: "#0F766E",
  color: "#FFFDF9",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "8px",
  margin: "8px 0 24px",
};

const footer = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#636E72",
  margin: "24px 0 0",
};

const link = { color: "#0F766E", textDecoration: "underline" };
