import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { renderDashboardPdf } from "@arvo/lib/report/render";

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

/** GET — render and download a scenario as a PDF. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const printUrl = `${baseUrl(req)}/arvo/scenarios/${params.id}/print`;
  try {
    // The print page sits behind clerkMiddleware too, so forward the caller's
    // session cookie for the headless browser's request.
    const pdf = await renderDashboardPdf(printUrl, req.headers.get("cookie") ?? undefined);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="arvo-scenario-${params.id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
