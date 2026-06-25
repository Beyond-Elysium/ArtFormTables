/**
 * Render a dashboard URL to a PDF with headless Chromium (Playwright).
 *
 * Uses `playwright-core` (no bundled browser) so the Chromium binary is supplied
 * by the environment:
 *   - Local / self-hosted: set CHROMIUM_EXECUTABLE_PATH to a Chromium binary.
 *   - Vercel serverless: install @sparticuz/chromium and point the env var at
 *     its `executablePath` (see REPORTS.md).
 */
import "server-only";
import { chromium } from "playwright-core";

function executablePath(): string {
  const p = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (!p) {
    throw new Error(
      "CHROMIUM_EXECUTABLE_PATH is not set — provide a path to a Chromium binary " +
        "(local) or use @sparticuz/chromium on serverless. See REPORTS.md.",
    );
  }
  return p;
}

export async function renderDashboardPdf(url: string): Promise<Buffer> {
  const browser = await chromium.launch({
    executablePath: executablePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
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
