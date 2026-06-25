import { NextRequest, NextResponse } from "next/server";
import { clients } from "@/config/clients";
import { renderDashboardPdf } from "@/lib/report/render";
import { sendReportEmail } from "@/lib/report/email";
import { resolveRange, formatWindow } from "@/lib/range";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function baseUrl(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Scheduled report run. Renders + emails every client with `report.enabled`.
 * Auth: a CRON_SECRET bearer token, or Vercel's `x-vercel-cron` header.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && !isVercelCron) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const targets = clients.filter((c) => c.report?.enabled && c.report.recipients.length > 0);
  const base = baseUrl(req);
  const periodLabel = formatWindow(resolveRange({}).window);

  const results: Array<{ slug: string; sent: boolean; reason?: string; id?: string }> = [];
  for (const c of targets) {
    try {
      const pdf = await renderDashboardPdf(`${base}/${c.slug}?print=1`);
      const r = await sendReportEmail({
        slug: c.slug,
        clientName: c.name,
        to: c.report!.recipients,
        periodLabel,
        sourceCount: c.sources.length,
        dashboardUrl: `${base}/${c.slug}`,
        accent: c.brand?.accent,
        pdf,
      });
      results.push({ slug: c.slug, ...r });
    } catch (err) {
      results.push({ slug: c.slug, sent: false, reason: String(err) });
    }
  }

  return NextResponse.json({ count: targets.length, results });
}
