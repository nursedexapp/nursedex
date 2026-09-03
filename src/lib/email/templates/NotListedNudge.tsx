import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface NotListedNudgeProps {
  firstName?: string;
}

/**
 * Sent to a verified nurse whose profile has no photo and no bio, so she is
 * not in the directory (#732).
 *
 * The tone matters: she has done the hard part, which is getting verified.
 * This is one small thing away from being findable, not a telling off.
 */
export function NotListedNudge({ firstName }: NotListedNudgeProps) {
  return (
    <EmailLayout preview="You are verified on NurseDex, but families cannot see your profile yet.">
      <Section>
        <Text style={heading}>
          You&apos;re verified{firstName ? `, ${firstName}` : ""}, but families
          cannot see you yet
        </Text>
        <Text style={paragraph}>
          Our team has checked your credentials, so the hard part is done. Your
          profile does not appear in the nurse directory yet, though, because
          there is no photo and no bio on it.
        </Text>
        <Text style={paragraph}>
          Families choose a nurse by what they can see. Adding either a photo
          or a few lines about yourself puts you in the directory straight
          away, and you can add the rest whenever you like.
        </Text>
        <Link href="https://nursedex.com/dashboard" style={button}>
          Finish your profile
        </Link>
        <Text style={footer}>
          Questions, or something not working? Reply to this email or reach us
          at{" "}
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
