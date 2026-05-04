import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface FeaturedAnalyticsProps {
  firstName?: string;
  thisWeek: { profileViews: number; saves: number; reveals: number };
  lastWeek: { profileViews: number; saves: number; reveals: number };
}

export function FeaturedAnalytics({
  firstName,
  thisWeek,
  lastWeek,
}: FeaturedAnalyticsProps) {
  return (
    <EmailLayout preview="Your weekly NurseDex performance recap.">
      <Section>
        <Text style={heading}>
          Your week on NurseDex{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          Here&apos;s how your Featured profile performed in the last seven
          days, with the previous week for comparison.
        </Text>

        <Row
          label="Profile views"
          current={thisWeek.profileViews}
          prior={lastWeek.profileViews}
        />
        <Row label="Saves" current={thisWeek.saves} prior={lastWeek.saves} />
        <Row
          label="Reveals (families who unlocked your contact info)"
          current={thisWeek.reveals}
          prior={lastWeek.reveals}
        />

        <Link href="https://nursedex.com/dashboard" style={button}>
          Go to dashboard
        </Link>
        <Text style={footer}>
          You&apos;re receiving this because you&apos;re a Featured nurse. Reply
          to this email or reach{" "}
          <Link href="mailto:support@nursedex.com" style={link}>
            support@nursedex.com
          </Link>
        </Text>
      </Section>
    </EmailLayout>
  );
}

function Row({
  label,
  current,
  prior,
}: {
  label: string;
  current: number;
  prior: number;
}) {
  const delta = current - prior;
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "·";
  const color = delta > 0 ? "#2A7B6F" : delta < 0 ? "#B45A5A" : "#636E72";
  return (
    <Text style={rowStyle}>
      <span style={{ color: "#636E72" }}>{label}</span>
      <br />
      <strong>{current.toLocaleString()}</strong>{" "}
      <span style={{ color }}>
        {arrow} {Math.abs(delta).toLocaleString()} vs last week
      </span>
    </Text>
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
const rowStyle = {
  fontSize: "15px",
  lineHeight: "22px",
  color: "#2D3436",
  margin: "12px 0",
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
