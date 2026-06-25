/**
 * Send a client's PDF report via Resend. Degrades gracefully: with no
 * RESEND_API_KEY (or no recipients) it returns `{ sent: false, reason }` rather
 * than throwing, so the surrounding flow (download, cron) still works.
 */
import "server-only";
import { Resend } from "resend";
import { ReportEmail } from "@/emails/ReportEmail";

export interface SendReportOptions {
  slug: string;
  clientName: string;
  to: string[];
  periodLabel: string;
  sourceCount: number;
  dashboardUrl: string;
  accent?: string;
  pdf: Buffer;
}

export interface SendReportResult {
  sent: boolean;
  reason?: string;
  id?: string;
}

export async function sendReportEmail(opts: SendReportOptions): Promise<SendReportResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY not set" };
  if (opts.to.length === 0) return { sent: false, reason: "no recipients" };

  const from = process.env.REPORT_FROM ?? "ArtForm Reports <reports@artform.agency>";
  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: `${opts.clientName} — performance report (${opts.periodLabel})`,
    react: ReportEmail({
      clientName: opts.clientName,
      periodLabel: opts.periodLabel,
      sourceCount: opts.sourceCount,
      dashboardUrl: opts.dashboardUrl,
      accent: opts.accent,
    }),
    attachments: [{ filename: `${opts.slug}-report.pdf`, content: opts.pdf }],
  });

  if (error) return { sent: false, reason: error.message };
  return { sent: true, id: data?.id };
}
