import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface SlaAlertAdminProps {
  approachingCount: number;
  overdueCount: number;
}

export function SlaAlertAdmin({
  approachingCount,
  overdueCount,
}: SlaAlertAdminProps) {
  return (
    <EmailLayout
      preview={`${overdueCount} verifications overdue, ${approachingCount} approaching SLA.`}
    >
      <Section>
        <Text style={heading}>Verification queue needs attention</Text>
        <Text style={paragraph}>
          {overdueCount > 0 ? (
            <>
              <strong>
                {`${overdueCount} verification${overdueCount === 1 ? "" : "s"} ${overdueCount === 1 ? "is" : "are"} now overdue.`}
              </strong>{" "}
            </>
          ) : null}
          {`${approachingCount} additional verification${approachingCount === 1 ? " is" : "s are"} past 75% of the SLA and approaching the deadline (24h Featured, 72h Free).`}
        </Text>
        <Link href="https://nursedex.com/admin/verifications" style={button}>
          Open queue
        </Link>
        <Text style={footer}>
          You&apos;re receiving this because you&apos;re a NurseDex admin. Reply
          to flag a false positive or to{" "}
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
