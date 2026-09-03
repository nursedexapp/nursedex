import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import type { ListingGap } from "@/lib/nurses/listing";

interface NotListedNudgeProps {
  firstName?: string;
  /**
   * What is actually keeping her out, computed by the cron from her own
   * profile with the same rule the directory filters on (#940). Passed in
   * rather than assumed, because there are two ways to be missing and this
   * email makes a statement about a real person's own profile.
   */
  gaps: ListingGap[];
}

/**
 * Sent to a verified nurse the directory does not show, saying what is
 * keeping her out (#732, #940).
 *
 * The tone matters: she has done the hard part, which is getting verified.
 * This is one small thing away from being findable, not a telling off.
 */
export function NotListedNudge({ firstName, gaps }: NotListedNudgeProps) {
  return (
    <EmailLayout preview="You are verified on NurseDex, but families cannot see your profile yet.">
      <Section>
        <Text style={heading}>
          You&apos;re verified{firstName ? `, ${firstName}` : ""}, but families
          cannot see you yet
        </Text>
        <Text style={paragraph}>
          Our team has checked your credentials, so the hard part is done. Your
          profile does not appear in the nurse directory yet, though, and this
          is what it still needs.
        </Text>
        {gaps.includes("content") && (
          <Text style={paragraph}>
            A photo or a few lines about yourself. Families choose a nurse by
            what they can see, and either one on its own is enough.
          </Text>
        )}
        {gaps.includes("care_type") && (
          <Text style={paragraph}>
            The type of care you provide. It is how families narrow their
            search, so without it they cannot find you even once you are
            showing.
          </Text>
        )}
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
