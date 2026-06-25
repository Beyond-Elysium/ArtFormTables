import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/config/clients";
import { renderDashboardPdf } from "@/lib/report/render";
import { sendReportEmail } from "@/lib/report/email";
import { resolveRange, formatWindow } from "@/lib/range";

// Headless Chromium needs the Node runtime; allow up to a minute.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function baseUrl(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function context(req: NextRequest, slug: string) {
  const sp = req.nextUrl.searchParams;
  const forward = new URLSearchParams();
  for (const k of ["range", "from", "to", "compare"]) {
    const v = sp.get(k);
    if (v) forward.set(k, v);
  }
  const resolved = resolveRange({
    range: sp.get("range") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    compare: sp.get("compare") ?? undefined,
  });
  forward.set("print", "1");
  const printUrl = `${baseUrl(req)}/${slug}?${forward.toString()}`;
  return { printUrl, periodLabel: formatWindow(resolved.window) };
}

/** GET — render and download the dashboard as a PDF. */
export async function GET(req: NextRequest, { params }: { params: { client: string } }) {
  const client = getClientBySlug(params.client);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

  const { printUrl } = context(req, client.slug);
  try {
    const pdf = await renderDashboardPdf(printUrl);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${client.slug}-report.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST — render and email the report to recipients (auth required if a token is set). */
export async function POST(req: NextRequest, { params }: { params: { client: string } }) {
  const token = process.env.REPORT_TOKEN ?? process.env.CRON_SECRET;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = getClientBySlug(params.client);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { to?: string[] };
  const to = body.to ?? client.report?.recipients ?? [];

  const { printUrl, periodLabel } = context(req, client.slug);
  try {
    const pdf = await renderDashboardPdf(printUrl);
    const result = await sendReportEmail({
      slug: client.slug,
      clientName: client.name,
      to,
      periodLabel,
      sourceCount: client.sources.length,
      dashboardUrl: `${baseUrl(req)}/${client.slug}`,
      accent: client.brand?.accent,
      pdf,
    });
    return NextResponse.json(result, { status: result.sent ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
