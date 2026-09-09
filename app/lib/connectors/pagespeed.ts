/**
 * PageSpeed Insights connector (PageSpeed Insights API v5).
 *
 * The technical-SEO / performance signal the dashboard otherwise has no source
 * for: Lighthouse category scores (Performance, SEO, Accessibility, Best
 * practices) plus Core Web Vitals and the biggest fixable opportunities.
 *
 * Env: PAGESPEED_API_KEY (free — a Google Cloud API key with the PageSpeed
 * Insights API enabled). The endpoint technically works keyless but throttles
 * aggressively, so `isLive` requires the key rather than pretending an
 * inevitable 429 is a live source.
 * Config: { url, strategy?: "mobile" | "desktop", label? }.
 *
 * Two things make this connector unlike the others:
 *
 *   1. **It's point-in-time, not a date range.** Lighthouse measures the page
 *      *now*; there is no historical query. So `ctx`'s window is deliberately
 *      ignored, and stats carry no deltas — a period-over-period comparison of
 *      a live measurement would be two identical numbers. Captions say when
 *      and how it was measured instead. (Persisting scores into the semantic
 *      layer is what would turn this into a trend — same shape as the AI Score
 *      history in `semantic/specs/ai.yaml`.)
 *   2. **It's slow.** A real Lighthouse run takes ~10–30s, well past the
 *      shared 10s `http.ts` timeout, so this passes its own longer timeout and
 *      disables retries (retrying a 20s call risks a serverless function
 *      timeout for no benefit). A timeout falls back to mock like any other
 *      failure. Results are served from the orchestrator's 1-hour cache, so
 *      the cost is once per client per window, not per page view.
 *
 * Field data (`loadingExperience`, real Chrome users via CrUX) is preferred
 * for Core Web Vitals and lab audits are the fallback, because low-traffic
 * URLs have no field data at all.
 */
import "server-only";
import { z } from "zod";
import type { Connector, ConnectorContext, Panel } from "./types";
import { fetchJson } from "./http";
import { isPlaceholderSiteUrl } from "./placeholder";
import { rng } from "./mock";

interface PageSpeedConfig {
  /** Page to measure, e.g. "https://example.com/". */
  url: string;
  /** Lighthouse strategy; mobile is Google's ranking-relevant default. */
  strategy?: "mobile" | "desktop";
}

/** Lighthouse runs long; well past the shared 10s default. */
const TIMEOUT_MS = 25_000;
const MAX_OPPORTUNITIES = 6;

function apiKey(): string | undefined {
  return process.env.PAGESPEED_API_KEY;
}

/* ----------------------------- live path ----------------------------- */

// Lighthouse payloads are enormous and their exact shape drifts between
// versions; keep the schema to what's actually read and tolerate the rest.
const categoryScore = z.object({ score: z.number().nullish() }).nullish();

const responseSchema = z.object({
  lighthouseResult: z
    .object({
      categories: z
        .object({
          performance: categoryScore,
          seo: categoryScore,
          accessibility: categoryScore,
          "best-practices": categoryScore,
        })
        .nullish(),
      audits: z
        .record(
          z.string(),
          z
            .object({
              title: z.string().nullish(),
              numericValue: z.number().nullish(),
              details: z.object({ overallSavingsMs: z.number().nullish() }).nullish(),
            })
            .nullish(),
        )
        .nullish(),
    })
    .nullish(),
  loadingExperience: z
    .object({
      metrics: z
        .record(z.string(), z.object({ percentile: z.number().nullish() }).nullish())
        .nullish(),
    })
    .nullish(),
});

type PageSpeedResponse = z.infer<typeof responseSchema>;

/** Lighthouse category scores are 0..1; the familiar figure is 0..100. */
function toScore(v: number | null | undefined): number | undefined {
  return typeof v === "number" ? Math.round(v * 100) : undefined;
}

export interface WebVitals {
  /** Largest Contentful Paint, in seconds. */
  lcp?: number;
  /** Cumulative Layout Shift, unitless. */
  cls?: number;
  /** Interaction to Next Paint, in milliseconds. */
  inp?: number;
  /** True when these came from real users (CrUX) rather than the lab run. */
  field: boolean;
}

/**
 * Core Web Vitals, preferring real-user field data over the lab run.
 *
 * Note the units: CrUX reports LCP/INP in milliseconds and CLS *multiplied by
 * 100* (a percentile of 5 means 0.05), whereas the lab audits report LCP in
 * milliseconds and CLS already unitless. Getting the CLS scaling wrong is the
 * easy mistake here, so both paths normalise explicitly.
 *
 * Exported for tests.
 */
export function extractVitals(json: PageSpeedResponse): WebVitals {
  const field = json.loadingExperience?.metrics ?? undefined;
  const lcpField = field?.["LARGEST_CONTENTFUL_PAINT_MS"]?.percentile;
  const clsField = field?.["CUMULATIVE_LAYOUT_SHIFT_SCORE"]?.percentile;
  const inpField = field?.["INTERACTION_TO_NEXT_PAINT"]?.percentile;

  if (typeof lcpField === "number" || typeof clsField === "number" || typeof inpField === "number") {
    return {
      lcp: typeof lcpField === "number" ? lcpField / 1000 : undefined,
      cls: typeof clsField === "number" ? clsField / 100 : undefined,
      inp: typeof inpField === "number" ? inpField : undefined,
      field: true,
    };
  }

  const audits = json.lighthouseResult?.audits ?? undefined;
  const lcpLab = audits?.["largest-contentful-paint"]?.numericValue;
  const clsLab = audits?.["cumulative-layout-shift"]?.numericValue;
  return {
    lcp: typeof lcpLab === "number" ? lcpLab / 1000 : undefined,
    cls: typeof clsLab === "number" ? clsLab : undefined,
    // No lab equivalent of INP (the lab proxy is Total Blocking Time, a
    // different metric) — better to omit it than to mislabel one as the other.
    inp: undefined,
    field: false,
  };
}

/** Audits with a measurable time saving, biggest first. Exported for tests. */
export function extractOpportunities(
  json: PageSpeedResponse,
): { label: string; value: number }[] {
  const audits = json.lighthouseResult?.audits ?? {};
  return Object.entries(audits)
    .map(([id, audit]) => ({
      label: audit?.title ?? id,
      value: Math.round(audit?.details?.overallSavingsMs ?? 0),
    }))
    .filter((o) => o.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_OPPORTUNITIES);
}

async function fetchLive(config: PageSpeedConfig): Promise<Panel[]> {
  const strategy = config.strategy ?? "mobile";
  const qs = new URLSearchParams({ url: config.url, strategy, key: apiKey()! });
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) {
    qs.append("category", c);
  }

  const json = await fetchJson(
    responseSchema,
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`,
    // Own timeout (Lighthouse is slow) and no retry — a retried 25s call can
    // outlast the serverless function itself.
    { timeout: TIMEOUT_MS, retry: 0 },
  );

  const cats = json.lighthouseResult?.categories ?? undefined;
  return buildPanels(
    {
      performance: toScore(cats?.performance?.score),
      seo: toScore(cats?.seo?.score),
      accessibility: toScore(cats?.accessibility?.score),
      bestPractices: toScore(cats?.["best-practices"]?.score),
    },
    extractVitals(json),
    extractOpportunities(json),
    strategy,
  );
}

/* ----------------------------- mock path ----------------------------- */

function fetchMock(config: PageSpeedConfig, ctx: ConnectorContext): Panel[] {
  const strategy = config.strategy ?? "mobile";
  const rand = rng(`psi:${config.url}:${strategy}:${ctx.range}`);
  const score = (min: number, span: number) => Math.round(min + rand() * span);
  const opportunities = [
    "Eliminate render-blocking resources",
    "Properly size images",
    "Serve images in next-gen formats",
    "Reduce unused JavaScript",
    "Enable text compression",
    "Preconnect to required origins",
  ]
    .map((label) => ({ label, value: Math.round(120 + rand() * 900) }))
    .sort((a, b) => b.value - a.value);

  return buildPanels(
    {
      performance: score(45, 50),
      seo: score(80, 20),
      accessibility: score(70, 28),
      bestPractices: score(70, 28),
    },
    { lcp: 1.6 + rand() * 2.6, cls: Math.round(rand() * 22) / 100, inp: Math.round(120 + rand() * 200), field: true },
    opportunities,
    strategy,
  );
}

/* --------------------- shared panel shaping -------------------------- */

/** Lighthouse's own 90/50 thresholds, so wording matches the PSI report. */
function scoreCaption(score: number): string {
  if (score >= 90) return "Good";
  if (score >= 50) return "Needs improvement";
  return "Poor";
}

/**
 * Panels for both live and mock. Scores carry no `delta`: the measurement is
 * taken now, so a period-over-period change would be meaningless.
 *
 * Exported for tests.
 */
export function buildPanels(
  scores: {
    performance?: number;
    seo?: number;
    accessibility?: number;
    bestPractices?: number;
  },
  vitals: WebVitals,
  opportunities: { label: string; value: number }[],
  strategy: string,
): Panel[] {
  const panels: Panel[] = [];
  const measuredOn = strategy === "desktop" ? "Desktop" : "Mobile";

  const scoreStat = (label: string, value: number | undefined) => {
    if (value == null) return;
    panels.push({
      kind: "stat",
      label,
      value,
      format: "number",
      caption: `${scoreCaption(value)} · ${measuredOn} · out of 100`,
    });
  };
  scoreStat("Performance", scores.performance);
  scoreStat("SEO score", scores.seo);
  scoreStat("Accessibility", scores.accessibility);
  scoreStat("Best practices", scores.bestPractices);

  const source = vitals.field ? "Real users (28-day)" : "Lab test";
  if (vitals.lcp != null) {
    panels.push({
      kind: "stat",
      label: "Largest Contentful Paint",
      value: vitals.lcp,
      // `decimal` (one dp) not `duration` — formatDuration renders "0m 02s",
      // which is wrong for a metric measured in single-digit seconds.
      format: "decimal",
      caption: `Seconds · good is under 2.5 · ${source}`,
      invertDelta: true,
    });
  }
  if (vitals.cls != null) {
    panels.push({
      kind: "stat",
      label: "Layout shift (CLS)",
      value: vitals.cls,
      format: "decimal",
      caption: `Good is under 0.1 · ${source}`,
      invertDelta: true,
    });
  }
  if (vitals.inp != null) {
    panels.push({
      kind: "stat",
      label: "Interaction latency (INP)",
      value: vitals.inp,
      format: "number",
      caption: `Milliseconds · good is under 200 · ${source}`,
      invertDelta: true,
    });
  }

  if (opportunities.length > 0) {
    panels.push({
      kind: "breakdown",
      title: "Top opportunities",
      subtitle: "Estimated load time saved if fixed",
      display: "table",
      valueLabel: "Saving (ms)",
      rows: opportunities,
    });
  }
  return panels;
}

export const pagespeedConnector: Connector<PageSpeedConfig> = {
  type: "pagespeed",
  label: "Page Speed",
  category: "Search",
  isLive: () => Boolean(apiKey()),
  async fetch(config, ctx) {
    const base = { sourceId: "pagespeed", label: "Page Speed", category: "Search" };
    if (!apiKey() || isPlaceholderSiteUrl(config.url))
      return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config), isMock: false };
    } catch (err) {
      console.error(`[pagespeed] live fetch failed for ${config.url}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
