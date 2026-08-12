/**
 * Microsoft Advertising (Bing Ads) connector — Reporting Service v13.
 *
 * Auth: OAuth2 refresh token (Microsoft identity platform) + a Microsoft
 * Advertising developer token, the same shape as Google Ads (googleAds.ts).
 *
 * Env: MICROSOFT_ADS_CLIENT_ID, MICROSOFT_ADS_CLIENT_SECRET,
 *      MICROSOFT_ADS_REFRESH_TOKEN, MICROSOFT_ADS_DEVELOPER_TOKEN,
 *      optional MICROSOFT_ADS_CUSTOMER_ID (manager/agency customer id, if the
 *      account sits under one — sent as the CustomerId SOAP header).
 * Config: { accountId, customerId?, currency?, campaignFilter?, hideSpend? }.
 *
 * Unlike Google Ads (REST + GAQL) and LinkedIn (REST), Microsoft Advertising's
 * Reporting Service is SOAP and asynchronous: submit a report request, poll
 * until it's ready, then download a compressed CSV. This implementation does
 * that end to end (SubmitGenerateReport → PollGenerateReport → download +
 * unzip + parse), including a minimal hand-rolled ZIP reader (Node has no
 * built-in PKZIP support) — the report archive is expected to hold exactly
 * one small CSV entry, which is what CampaignPerformanceReport downloads are.
 *
 * Caveats worth knowing before wiring real credentials:
 *   - SOAP header/action namespaces and the exact report-column enum names
 *     are written to the documented v13 shape from memory; verify against the
 *     current WSDL (https://reporting.api.bingads.microsoft.com/Api/Advertiser/Reporting/v13/ReportingService.svc?wsdl)
 *     once real credentials exist — same disclaimer as linkedinAds.ts.
 *   - Report generation is async and can take tens of seconds; the poll loop
 *     below is capped (MAX_POLLS × POLL_INTERVAL_MS) so a slow report falls
 *     back to mock rather than hanging the page. A scheduled job that
 *     pre-generates and caches the report (mirroring the semantic layer's
 *     rollups.py pattern) would be more robust for production than
 *     generating it inline on every dashboard load.
 *   - Keyword-level reporting (KeywordPerformanceReport, the "top CCC
 *     keywords" detail) is a separate report type and isn't fetched here —
 *     only the campaign-level performance + Search/Audience split.
 *
 * `campaignFilter` scopes one shared Microsoft Advertising account to a
 * single campaign/vertical view (a substring match against CampaignName,
 * applied client-side after the report is parsed — Microsoft's Reporting API
 * scopes by account/campaign id in the request, not by a name filter, and
 * per-vertical campaign ids usually aren't known up front).
 */
import "server-only";
import zlib from "node:zlib";
import type { Connector, ConnectorContext, Panel } from "./types";
import { isPlaceholderId } from "./placeholder";
import { mockDelta, mockSeries, rng } from "./mock";
import { pct, rangeDates } from "./util";

interface MicrosoftAdsConfig {
  /** Microsoft Advertising account id (numeric). */
  accountId: string;
  /** Manager/agency customer id, if the account sits under one. */
  customerId?: string;
  currency?: string;
  /** Case-insensitive substring match against CampaignName, applied after fetch. */
  campaignFilter?: string | string[];
  /** Suppress the Spend stat, spend timeseries line, and spend breakdown. */
  hideSpend?: boolean;
}

const REPORTING_ENDPOINT =
  "https://reporting.api.bingads.microsoft.com/Api/Advertiser/Reporting/v13/ReportingService.svc";
const HEADER_NS = "https://bingads.microsoft.com/Customer/v13";
const REPORTING_NS = "https://bingads.microsoft.com/Reporting/v13";

const MAX_POLLS = 6;
const POLL_INTERVAL_MS = 2000;
const FETCH_TIMEOUT_MS = 15_000;

function hasCredentials(): boolean {
  return Boolean(
    process.env.MICROSOFT_ADS_CLIENT_ID &&
      process.env.MICROSOFT_ADS_CLIENT_SECRET &&
      process.env.MICROSOFT_ADS_REFRESH_TOKEN &&
      process.env.MICROSOFT_ADS_DEVELOPER_TOKEN,
  );
}

/* ------------------------------------------------------------------ *
 * OAuth (Microsoft identity platform, same refresh-token exchange
 * pattern as googleAds.ts's getAccessToken).
 * ------------------------------------------------------------------ */

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_ADS_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_ADS_CLIENT_SECRET!,
    refresh_token: process.env.MICROSOFT_ADS_REFRESH_TOKEN!,
    grant_type: "refresh_token",
    scope: "https://ads.microsoft.com/msads.manage offline_access",
  });
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Microsoft Ads OAuth ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

/* ------------------------------------------------------------------ *
 * SOAP plumbing
 * ------------------------------------------------------------------ */

function soapHeaders(token: string, customerId: string | undefined, accountId: string): string {
  return `
    <AuthenticationToken xmlns="${HEADER_NS}">${token}</AuthenticationToken>
    <DeveloperToken xmlns="${HEADER_NS}">${process.env.MICROSOFT_ADS_DEVELOPER_TOKEN}</DeveloperToken>
    ${customerId ? `<CustomerId xmlns="${HEADER_NS}">${customerId}</CustomerId>` : ""}
    <CustomerAccountId xmlns="${HEADER_NS}">${accountId}</CustomerAccountId>`;
}

async function soapCall(action: string, bodyXml: string, headersXml: string): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header>${headersXml}</s:Header>
  <s:Body>${bodyXml}</s:Body>
</s:Envelope>`;
  const res = await fetch(REPORTING_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: action },
    body: envelope,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Microsoft Ads ${action} ${res.status}: ${text}`);
  return text;
}

/** Minimal single-tag text extractor (no namespaces in the tag match, so it
 *  works regardless of the response's namespace prefix, e.g. <a:Foo>x</a:Foo>). */
function extractTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)<`));
  return m?.[1];
}

/* ------------------------------------------------------------------ *
 * Report submit → poll → download
 * ------------------------------------------------------------------ */

const REPORT_COLUMNS = ["TimePeriod", "CampaignName", "AdDistribution", "Impressions", "Clicks", "Spend"];

function submitBody(accountId: string, start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const columns = REPORT_COLUMNS.map((c) => `<ReportColumn>${c}</ReportColumn>`).join("");
  return `
    <SubmitGenerateReport xmlns="${REPORTING_NS}">
      <ReportRequest i:type="CampaignPerformanceReportRequest" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
        <Format>Csv</Format>
        <ReportName>ArtForm dashboard export</ReportName>
        <ReturnOnlyCompleteData>false</ReturnOnlyCompleteData>
        <Aggregation>Daily</Aggregation>
        <Scope>
          <AccountIds xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><a:long>${accountId}</a:long></AccountIds>
        </Scope>
        <Time>
          <CustomDateRangeStart><Day>${sd}</Day><Month>${sm}</Month><Year>${sy}</Year></CustomDateRangeStart>
          <CustomDateRangeEnd><Day>${ed}</Day><Month>${em}</Month><Year>${ey}</Year></CustomDateRangeEnd>
        </Time>
        <Columns>${columns}</Columns>
      </ReportRequest>
    </SubmitGenerateReport>`;
}

async function submitReport(
  headersXml: string,
  accountId: string,
  start: string,
  end: string,
): Promise<string> {
  const xml = await soapCall(`${REPORTING_NS}/IReportingService/SubmitGenerateReport`, submitBody(accountId, start, end), headersXml);
  const id = extractTag(xml, "ReportRequestId");
  if (!id) throw new Error(`Microsoft Ads: SubmitGenerateReport returned no ReportRequestId: ${xml.slice(0, 300)}`);
  return id;
}

async function pollUntilReady(headersXml: string, requestId: string): Promise<string> {
  const body = `<PollGenerateReport xmlns="${REPORTING_NS}"><ReportRequestId>${requestId}</ReportRequestId></PollGenerateReport>`;
  for (let i = 0; i < MAX_POLLS; i++) {
    const xml = await soapCall(`${REPORTING_NS}/IReportingService/PollGenerateReport`, body, headersXml);
    const status = extractTag(xml, "Status");
    if (status === "Success") {
      const url = extractTag(xml, "ReportDownloadUrl");
      if (!url) throw new Error("Microsoft Ads: report succeeded but returned no download URL");
      return url;
    }
    if (status === "Error") throw new Error(`Microsoft Ads: report generation failed: ${xml.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Microsoft Ads: report polling timed out");
}

/**
 * Minimal ZIP reader for a single/few-entry, stored-or-deflated archive
 * (Node has no built-in PKZIP support). Reads local file headers directly
 * rather than the central directory, which is fine for the small archives
 * Microsoft's report downloads produce. Returns the first entry's bytes.
 * Exported for tests.
 */
export function readFirstZipEntry(buf: Buffer): Buffer {
  const LOCAL_HEADER_SIG = 0x04034b50;
  if (buf.length < 30 || buf.readUInt32LE(0) !== LOCAL_HEADER_SIG) {
    throw new Error("Microsoft Ads: unexpected report archive format (not a ZIP local file header)");
  }
  const method = buf.readUInt16LE(8); // 0 = stored, 8 = deflate
  const compSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const dataStart = 30 + nameLen + extraLen;
  const compressed = buf.subarray(dataStart, dataStart + compSize);
  if (method === 0) return Buffer.from(compressed);
  if (method === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`Microsoft Ads: unsupported ZIP compression method ${method}`);
}

/** Tiny CSV line splitter handling quoted fields (report values are plain, but be safe). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

interface ReportRow {
  date: string;
  campaignName: string;
  adDistribution: string;
  impressions: number;
  clicks: number;
  spend: number;
}

/**
 * Parse the downloaded report CSV into rows. Microsoft's CSV reports include
 * a metadata preamble before the header row, so this scans for the first
 * line that matches the requested column headers rather than assuming line 1.
 * Exported for tests.
 */
export function parseReportCsv(csv: string): ReportRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const headerIdx = lines.findIndex((l) => REPORT_COLUMNS.every((c) => l.includes(c)));
  if (headerIdx === -1) return [];
  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.trim());
  const col = (name: string) => headers.indexOf(name);
  const iDate = col("TimePeriod");
  const iCampaign = col("CampaignName");
  const iDist = col("AdDistribution");
  const iImpr = col("Impressions");
  const iClicks = col("Clicks");
  const iSpend = col("Spend");

  const rows: ReportRow[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitCsvLine(line);
    if (cells.length < headers.length) continue;
    const date = (cells[iDate] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) continue; // skip trailing summary rows
    rows.push({
      date: date.slice(0, 10),
      campaignName: (cells[iCampaign] ?? "(unknown)").trim(),
      adDistribution: (cells[iDist] ?? "").trim() || "Search",
      impressions: Number(cells[iImpr] ?? 0) || 0,
      clicks: Number(cells[iClicks] ?? 0) || 0,
      spend: Number(cells[iSpend] ?? 0) || 0,
    });
  }
  return rows;
}

/** Case-insensitive substring filter against campaignName. Exported for tests. */
export function filterRows(rows: ReportRow[], filter?: string | string[]): ReportRow[] {
  if (!filter) return rows;
  const needles = (Array.isArray(filter) ? filter : [filter])
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  if (needles.length === 0) return rows;
  return rows.filter((r) => needles.some((n) => r.campaignName.toLowerCase().includes(n)));
}

async function fetchAndParseReport(headersXml: string, accountId: string, start: string, end: string): Promise<ReportRow[]> {
  const requestId = await submitReport(headersXml, accountId, start, end);
  const downloadUrl = await pollUntilReady(headersXml, requestId);
  const res = await fetch(downloadUrl, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Microsoft Ads: report download ${res.status}`);
  const zipBuf = Buffer.from(await res.arrayBuffer());
  const csvBuf = readFirstZipEntry(zipBuf);
  return parseReportCsv(csvBuf.toString("utf-8"));
}

/* ------------------------------------------------------------------ *
 * Live
 * ------------------------------------------------------------------ */

async function fetchLive(config: MicrosoftAdsConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const token = await getAccessToken();
  const headersXml = soapHeaders(token, config.customerId ?? process.env.MICROSOFT_ADS_CUSTOMER_ID, config.accountId);
  const { start, end, prevStart, prevEnd } = rangeDates(ctx.days);

  const [currentRows, prevRows] = await Promise.all([
    fetchAndParseReport(headersXml, config.accountId, start, end),
    fetchAndParseReport(headersXml, config.accountId, prevStart, prevEnd),
  ]);
  const current = filterRows(currentRows, config.campaignFilter);
  const prev = filterRows(prevRows, config.campaignFilter);

  return summarize(currency, current, prev, config.hideSpend);
}

/** Shared aggregation for both live and mock rows (kept pure, exported for tests). */
export function summarize(
  currency: string,
  current: ReportRow[],
  prev: ReportRow[],
  hideSpend?: boolean,
): Panel[] {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  const byDate = new Map<string, { spend: number; clicks: number }>();
  const byCampaign = new Map<string, number>();
  const byDistribution = new Map<string, number>();

  for (const r of current) {
    spend += r.spend;
    clicks += r.clicks;
    impressions += r.impressions;
    const e = byDate.get(r.date) ?? { spend: 0, clicks: 0 };
    e.spend += r.spend;
    e.clicks += r.clicks;
    byDate.set(r.date, e);
    byCampaign.set(r.campaignName, (byCampaign.get(r.campaignName) ?? 0) + r.spend);
    byDistribution.set(r.adDistribution, (byDistribution.get(r.adDistribution) ?? 0) + r.impressions);
  }

  let pSpend = 0;
  let pClicks = 0;
  let pImpr = 0;
  for (const r of prev) {
    pSpend += r.spend;
    pClicks += r.clicks;
    pImpr += r.impressions;
  }

  const ctr = impressions ? clicks / impressions : 0;
  const pCtr = pImpr ? pClicks / pImpr : 0;
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, v]) => ({ x, ...v }));
  const campaigns = [...byCampaign.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const distribution = [...byDistribution.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return buildPanels(
    currency,
    { spend, impressions, clicks, ctr },
    { spend: pct(spend, pSpend), impressions: pct(impressions, pImpr), clicks: pct(clicks, pClicks), ctr: pct(ctr, pCtr) },
    ts,
    campaigns,
    distribution,
    hideSpend,
  );
}

/* ------------------------------------------------------------------ *
 * Mock
 * ------------------------------------------------------------------ */

function fetchMock(config: MicrosoftAdsConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`msads:${config.accountId}:${JSON.stringify(config.campaignFilter ?? "")}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 200 + Math.floor(rand() * 500));
  const clicks = series.total;
  const impressions = Math.floor(clicks * (20 + rand() * 30));
  const cpc = 0.5 + rand() * 2;
  const spend = Math.round(clicks * cpc);
  const ctr = clicks / impressions;

  const ts = series.points.map((pt) => ({ x: pt.x, spend: Math.round(pt.y * cpc), clicks: pt.y }));
  const campaigns = ["Search — Brand", "Search — Generic", "Audience Network", "Retargeting", "Dynamic Search Ads"]
    .map((label) => ({ label, value: Math.floor(spend * (0.08 + rand() * 0.3)) }))
    .sort((a, b) => b.value - a.value);
  const searchShare = 0.6 + rand() * 0.3;
  const distribution = [
    { label: "Search", value: Math.floor(impressions * searchShare) },
    { label: "Audience", value: Math.floor(impressions * (1 - searchShare)) },
  ];

  return buildPanels(
    currency,
    { spend, impressions, clicks, ctr },
    { spend: mockDelta(rand), impressions: mockDelta(rand), clicks: mockDelta(rand), ctr: mockDelta(rand) },
    ts,
    campaigns,
    distribution,
    config.hideSpend,
  );
}

/* ------------------------------------------------------------------ *
 * Shared panel shaping
 * ------------------------------------------------------------------ */

function buildPanels(
  currency: string,
  m: { spend: number; impressions: number; clicks: number; ctr: number },
  d: { spend: number; impressions: number; clicks: number; ctr: number },
  ts: { x: string; spend: number; clicks: number }[],
  campaigns: { label: string; value: number }[],
  distribution: { label: string; value: number }[],
  hideSpend?: boolean,
): Panel[] {
  const panels: Panel[] = [];
  if (!hideSpend) {
    panels.push({ kind: "stat", label: "Spend", value: m.spend, format: "currency", currency, delta: d.spend, invertDelta: true });
  }
  panels.push(
    { kind: "stat", label: "Impressions", value: m.impressions, format: "compact", delta: d.impressions },
    { kind: "stat", label: "Clicks", value: m.clicks, format: "compact", delta: d.clicks },
    { kind: "stat", label: "CTR", value: m.ctr, format: "percent", delta: d.ctr },
    {
      kind: "timeseries",
      title: hideSpend ? "Clicks" : "Spend & clicks",
      series: hideSpend
        ? [{ name: "Clicks", points: ts.map((p) => ({ x: p.x, y: p.clicks })) }]
        : [
            { name: `Spend (${currency})`, points: ts.map((p) => ({ x: p.x, y: p.spend })) },
            { name: "Clicks", points: ts.map((p) => ({ x: p.x, y: p.clicks })) },
          ],
    },
  );
  if (!hideSpend) {
    panels.push({ kind: "breakdown", title: "Top campaigns by spend", display: "bar", valueLabel: "Spend", valueFormat: "currency", rows: campaigns });
  }
  if (distribution.length > 0) {
    panels.push({ kind: "breakdown", title: "Search vs Audience", display: "donut", valueLabel: "Impressions", rows: distribution });
  }
  return panels;
}

export const microsoftAdsConnector: Connector<MicrosoftAdsConfig> = {
  type: "microsoft-ads",
  label: "Microsoft Ads",
  category: "Advertising",
  isLive: () => hasCredentials(),
  async fetch(config, ctx) {
    const base = { sourceId: "microsoft-ads", label: "Microsoft Ads", category: "Advertising" };
    if (!hasCredentials() || isPlaceholderId(config.accountId))
      return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[microsoft-ads] live fetch failed for ${config.accountId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
