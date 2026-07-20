/**
 * Google Sheets connector — the universal token-free ingestion path
 * (designed in CONNECTORS.md). Anything an account manager can export or
 * maintain in a sheet (organic social, offline data, call logs…) becomes
 * dashboard panels, read via the same Google credential as GA4/Search Console.
 *
 * Auth: shared googleAuth.ts (OAuth refresh token or service account) with the
 * extra scope `https://www.googleapis.com/auth/spreadsheets.readonly`. With
 * OAuth, grant that scope when minting the refresh token; either way the
 * consenting account / service account needs view access to the spreadsheet.
 * No new env var.
 *
 * Expected sheet shape (values.get on "Tab!A:Z", first 1000 data rows):
 *   - Row 1 = column headers.
 *   - A "date" column (header "date", values YYYY-MM-DD) makes every numeric
 *     column a line on a time series, and the first numeric column also
 *     becomes a total stat.
 *   - Without a date column, rows render as a breakdown table (first column =
 *     label, second column = value), and the first numeric column also becomes
 *     a total stat.
 *   - Numeric cells may carry formatting ("1,234", "$12.50", "45%") — it's
 *     stripped on parse.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { googleAccessToken, hasGoogleAuth } from "./googleAuth";
import { resolveWindow } from "./dates";
import { rng } from "./mock";

interface GsheetsConfig {
  /** The spreadsheet id (from the sheet's URL). */
  spreadsheetId: string;
  /** Tab (sheet) name; defaults to the spreadsheet's first tab. */
  tab?: string;
  /** A1 range within the tab; defaults to A1:Z1001 (header + 1000 rows). */
  range?: string;
  /** Optional label override (also settable via the source's `label`). */
  label?: string;
}

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

/** Read at most this many data rows (excluding the header). */
export const MAX_ROWS = 1000;

/** Breakdown tables cap their visible rows; the total stat still sums all. */
const MAX_TABLE_ROWS = 25;

type Cell = string | number | null | undefined;

/**
 * Parse a sheet cell as a number, tolerating display formatting: thousands
 * separators, currency symbols, percent signs, whitespace. Returns null for
 * empty or non-numeric cells. Exported for tests.
 */
export function parseSheetNumber(cell: Cell): number | null {
  if (cell == null) return null;
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const cleaned = cell.replace(/[\s,$€£%]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Pure sheet → panels transform (exported for tests).
 *
 * `values` is the raw grid from the Sheets API (or the mock): row 1 headers,
 * then data rows. Behavior per the connector header: date column → timeseries
 * (+ total stat from the first numeric column); otherwise breakdown table
 * (+ total stat). Data rows beyond MAX_ROWS are ignored.
 */
export function sheetToPanels(values: Cell[][], sheetLabel = "Sheet data"): Panel[] {
  const headers = (values[0] ?? []).map((h) => String(h ?? "").trim());
  const rows = values
    .slice(1, 1 + MAX_ROWS)
    .filter((r) => r.some((c) => c != null && String(c).trim() !== ""));

  if (headers.length === 0 || rows.length === 0) {
    return [
      { kind: "stat", label: "Rows", value: 0, format: "number", caption: "No data rows in sheet" },
    ];
  }

  // A "date" column: header literally "date" with at least one ISO-looking value.
  const dateCol = headers.findIndex(
    (h, i) => /^date$/i.test(h) && rows.some((r) => ISO_DATE.test(String(r[i] ?? ""))),
  );

  // Numeric columns: every non-empty cell parses as a number (and at least one
  // cell is non-empty). The date column never counts.
  const numericCols = headers
    .map((_, i) => i)
    .filter((i) => {
      if (i === dateCol) return false;
      const cells = rows.map((r) => r[i]).filter((c) => c != null && String(c).trim() !== "");
      return cells.length > 0 && cells.every((c) => parseSheetNumber(c) != null);
    });

  if (numericCols.length === 0) {
    return [
      {
        kind: "stat",
        label: "Rows",
        value: rows.length,
        format: "number",
        caption: "No numeric columns found in sheet",
      },
    ];
  }

  const totalCol = numericCols[0];
  const total = rows.reduce((sum, r) => sum + (parseSheetNumber(r[totalCol]) ?? 0), 0);
  const totalStat: Panel = {
    kind: "stat",
    label: headers[totalCol] || "Total",
    value: total,
    format: Number.isInteger(total) ? "number" : "decimal",
    caption: `Sum of ${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"}`,
  };

  if (dateCol >= 0) {
    // Timeseries mode: one line per numeric column, sorted by date.
    const dated = rows
      .map((r) => ({ x: String(r[dateCol]).slice(0, 10), r }))
      .filter((d) => ISO_DATE.test(d.x))
      .sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0));
    return [
      totalStat,
      {
        kind: "timeseries",
        title: "Over time",
        subtitle: sheetLabel,
        series: numericCols.map((i) => ({
          name: headers[i] || `Column ${i + 1}`,
          points: dated.map((d) => ({ x: d.x, y: parseSheetNumber(d.r[i]) ?? 0 })),
        })),
      },
    ];
  }

  // Breakdown mode: first column = label, first numeric column = value.
  const labelCol = headers.findIndex((_, i) => i !== totalCol);
  const tableRows = rows.slice(0, MAX_TABLE_ROWS).map((r) => ({
    label: String(r[labelCol >= 0 ? labelCol : 0] ?? "").trim() || "(blank)",
    value: parseSheetNumber(r[totalCol]) ?? 0,
  }));
  return [
    totalStat,
    {
      kind: "breakdown",
      title: `${headers[totalCol] || "Value"} by ${headers[labelCol] || "row"}`,
      subtitle:
        rows.length > MAX_TABLE_ROWS
          ? `${sheetLabel} — top ${MAX_TABLE_ROWS} of ${rows.length.toLocaleString()} rows`
          : sheetLabel,
      display: "table",
      valueLabel: headers[totalCol] || "Value",
      rows: tableRows,
    },
  ];
}

async function fetchLive(config: GsheetsConfig, _ctx: ConnectorContext): Promise<Panel[]> {
  const token = await googleAccessToken([SCOPE]);
  const cellRange = config.range ?? `A1:Z${1 + MAX_ROWS}`;
  // Quote the tab name (doubling embedded quotes) so names with spaces work.
  const ref = config.tab ? `'${config.tab.replace(/'/g, "''")}'!${cellRange}` : cellRange;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(ref)}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { values?: Cell[][] };
  return sheetToPanels(data.values ?? [], config.label ?? config.tab ?? "Google Sheet");
}

/**
 * Deterministic sample sheet with a date column, run through the same
 * transform as live for parity — demos as a timeseries + total stat.
 */
function fetchMock(config: GsheetsConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`gsheets:${config.spreadsheetId ?? "demo"}:${ctx.range}`);
  const w = resolveWindow(ctx);
  const days = Math.min(w.days, MAX_ROWS);
  const followersBase = 800 + Math.floor(rand() * 4000);
  const values: Cell[][] = [["Date", "Followers", "Engagements"]];
  let followers = followersBase;
  const start = new Date(`${w.start}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    followers += Math.floor(rand() * 12);
    const engagements = Math.floor(followers * (0.01 + rand() * 0.04));
    values.push([d.toISOString().slice(0, 10), String(followers), String(engagements)]);
  }
  return sheetToPanels(values, config.label ?? "Sample social metrics sheet");
}

export const gsheetsConnector: Connector<GsheetsConfig> = {
  type: "gsheets",
  label: "Google Sheets",
  category: "Data",
  isLive: (config) => hasGoogleAuth() && Boolean(config.spreadsheetId),
  async fetch(config, ctx) {
    const base = { sourceId: "gsheets", label: config.label ?? "Google Sheets", category: "Data" };
    if (!hasGoogleAuth() || !config.spreadsheetId)
      return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[gsheets] live fetch failed for ${config.spreadsheetId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
