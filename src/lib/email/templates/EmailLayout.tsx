import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Hr,
  Font,
} from "@react-email/components";
import { BUSINESS_ADDRESS } from "@/lib/constants";

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  // A per-recipient one-click unsubscribe URL (e.g. the newsletter's
  // tokenized link). Falls back to the generic email-entry page for emails
  // that have no recipient token.
  unsubscribeUrl?: string;
}

export function EmailLayout({
  preview,
  children,
  unsubscribeUrl,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head>
        <Font
          fontFamily="DM Sans"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZOIHTWEBlw.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        {/* Header */}
        <Section style={header}>
          <Text style={logoText}>NurseDex</Text>
        </Section>

        {/* Content */}
        <Container style={container}>{children}</Container>

        {/* Footer */}
        <Section style={footer}>
          <Hr style={divider} />
          <Text style={footerText}>
            <Link href="https://nursedex.com" style={footerLink}>
              nursedex.com
            </Link>
          </Text>
          <Text style={footerText}>
            {BUSINESS_ADDRESS.line1}, {BUSINESS_ADDRESS.city},{" "}
            {BUSINESS_ADDRESS.state} {BUSINESS_ADDRESS.zip}
          </Text>
          <Text style={footerText}>
            <Link
              href={unsubscribeUrl ?? "https://nursedex.com/unsubscribe"}
              style={footerLink}
            >
              Unsubscribe
            </Link>{" "}
            from marketing emails
          </Text>
        </Section>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#FBF9F7",
  fontFamily: "'DM Sans', Helvetica, Arial, sans-serif",
  color: "#2D3436",
};

const header = {
  backgroundColor: "#2A7B6F",
  padding: "24px 0",
  textAlign: "center" as const,
};

const logoText = {
  color: "#FFFFFF",
  fontSize: "28px",
  fontWeight: 700,
  margin: "0",
  fontFamily: "Georgia, 'Times New Roman', serif",
};

const container = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "32px 24px",
};

const footer = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "0 24px 32px",
};

const divider = {
  borderColor: "#D4D4D8",
  margin: "24px 0",
};

const footerText = {
  color: "#636E72",
  fontSize: "12px",
  lineHeight: "20px",
  margin: "4px 0",
  textAlign: "center" as const,
};

const footerLink = {
  color: "#2A7B6F",
  textDecoration: "underline",
};
