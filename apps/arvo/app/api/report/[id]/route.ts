import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { arvoBaseUrl } from "@/lib/baseUrl";
import { renderDashboardPdf } from "@arvo/lib/report/render";

// Headless Chromium needs the Node runtime; allow up to a minute.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** GET — render and download a scenario as a PDF. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const printUrl = `${arvoBaseUrl()}/scenarios/${params.id}/print`;
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
