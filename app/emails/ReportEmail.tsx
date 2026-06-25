import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface ReportEmailProps {
  clientName: string;
  periodLabel: string;
  sourceCount: number;
  dashboardUrl: string;
  accent?: string;
}

/** Branded email body that accompanies the attached PDF report. */
export function ReportEmail({
  clientName,
  periodLabel,
  sourceCount,
  dashboardUrl,
  accent = "#e41679",
}: ReportEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {clientName} performance report — {periodLabel}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={{ borderTop: `4px solid ${accent}`, paddingTop: 24 }}>
            <Text style={kicker}>ARTFORM · PERFORMANCE REPORT</Text>
            <Heading style={heading}>{clientName}</Heading>
            <Text style={period}>{periodLabel}</Text>
          </Section>

          <Text style={paragraph}>
            Your performance report for the period above is attached as a PDF,
            covering {sourceCount} data source{sourceCount === 1 ? "" : "s"}.
          </Text>

          <Section style={{ marginTop: 24, marginBottom: 24 }}>
            <Link href={dashboardUrl} style={button}>
              View live dashboard
            </Link>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Sent by ArtForm. Reply to this email if anything looks off.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ReportEmail;

const body = { backgroundColor: "#f6f7f9", fontFamily: "Montserrat, Arial, sans-serif" };
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "0 32px 32px",
  maxWidth: 560,
  border: "1px solid #e6e7e9",
};
const kicker = {
  fontSize: 11,
  letterSpacing: 1,
  color: "#5a6372",
  fontWeight: 700 as const,
  margin: 0,
};
const heading = { fontSize: 28, color: "#16191f", margin: "8px 0 0", fontWeight: 800 as const };
const period = { fontSize: 14, color: "#5a6372", margin: "4px 0 0" };
const paragraph = { fontSize: 15, lineHeight: "24px", color: "#16191f" };
const button = {
  backgroundColor: "#426fb6",
  color: "#ffffff",
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 700 as const,
  textDecoration: "none",
  display: "inline-block",
};
const hr = { borderColor: "#e6e7e9", margin: "24px 0" };
const footer = { fontSize: 12, color: "#5a6372" };
