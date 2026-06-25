/**
 * Render a dashboard URL to a PDF with headless Chromium (Playwright).
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

export async function renderDashboardPdf(url: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    // ApexCharts mounts client-side; give it a moment to paint.
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
