/**
 * Render a scenario print-page URL to a PDF with headless Chromium (Playwright).
 *
 * Browser resolution is automatic:
 *   - If CHROMIUM_EXECUTABLE_PATH is set (local / self-hosted), use that binary.
 *   - Otherwise fall back to @sparticuz/chromium's bundled binary, which works
 *     on serverless platforms (Vercel/AWS Lambda). It's imported dynamically so
 *     the ~50MB binary isn't loaded during local development.
 */
import "server-only";
import { chromium, type Browser } from "playwright-core";

async function launchBrowser(): Promise<Browser> {
  const localPath = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (localPath) {
    return chromium.launch({
      executablePath: localPath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }

  // Serverless: use the bundled Chromium build.
  const sparticuz = (await import("@sparticuz/chromium")).default;
  return chromium.launch({
    args: sparticuz.args,
    executablePath: await sparticuz.executablePath(),
    headless: true,
  });
}

/**
 * `cookieHeader` forwards the caller's Clerk session cookie to the headless
 * browser. Unlike app/'s public dashboards, every Arvo route (the print page
 * included) sits behind clerkMiddleware, so without it the browser would just
 * hit the sign-in redirect instead of the print page.
 */
export async function renderDashboardPdf(url: string, cookieHeader?: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    if (cookieHeader) {
      await page.setExtraHTTPHeaders({ cookie: cookieHeader });
    }
    await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    // Charts/rings mount client-side; give them a moment to paint.
    await page.waitForTimeout(2_500);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18px", right: "18px", bottom: "18px", left: "18px" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
