/**
 * Hand-rolled CSV serialization for per-panel exports ("can I get the raw
 * numbers?"). No dependency: the format is small enough that a correct escaper
 * (RFC 4180) is a few lines, and keeping it pure means it runs in the
 * client-side download buttons and in unit tests alike.
 *
 * Values are emitted raw (no locale formatting) so the file round-trips into
 * spreadsheets cleanly.
 */

/**
 * Escape one CSV field: wrap in double quotes when it contains a comma, quote,
 * or line break, doubling any embedded quotes. Plain fields pass through.
 */
export function csvEscape(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** Serialize rows of cells to CSV text (CRLF line endings per RFC 4180). */
export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  return rows
    .map((row) => row.map((cell) => csvEscape(cell == null ? "" : String(cell))).join(","))
    .join("\r\n");
}

/**
 * A safe download filename from label parts, e.g.
 * `csvFilename("Google Search", "Keyword breakdown", "Jun 22 – Jul 19, 2026")`
 * → "google-search-keyword-breakdown-jun-22-jul-19-2026.csv".
 * Empty/undefined parts are skipped.
 */
export function csvFilename(...parts: (string | undefined)[]): string {
  const slug = parts
    .filter((p): p is string => Boolean(p))
    .map((p) =>
      p
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("-");
  return `${slug || "export"}.csv`;
}

/**
 * A timeseries panel's series as CSV: first column Date, one column per line
 * (including any dashed "(prev)" comparison overlays). Dates are the union of
 * every series' x values in first-seen order; a series without a point on a
 * date leaves the cell empty.
 */
export function timeseriesCsv(
  series: ReadonlyArray<{ name: string; points: ReadonlyArray<{ x: string; y: number }> }>,
): string {
  const dates: string[] = [];
  const seen = new Set<string>();
  for (const s of series) {
    for (const pt of s.points) {
      if (!seen.has(pt.x)) {
        seen.add(pt.x);
        dates.push(pt.x);
      }
    }
  }
  const byDate = series.map((s) => new Map(s.points.map((pt) => [pt.x, pt.y])));
  const rows: (string | number | null)[][] = [["Date", ...series.map((s) => s.name)]];
  for (const d of dates) {
    rows.push([d, ...byDate.map((m) => m.get(d) ?? null)]);
  }
  return toCsv(rows);
}

/**
 * A breakdown panel's rows as CSV: Name, value (headed by the panel's value
 * label), and a Details column when any row carries a sublabel.
 */
export function breakdownCsv(
  rows: ReadonlyArray<{ label: string; value: number; sublabel?: string }>,
  valueLabel = "Value",
): string {
  const hasDetails = rows.some((r) => r.sublabel);
  const out: (string | number | null)[][] = [
    hasDetails ? ["Name", valueLabel, "Details"] : ["Name", valueLabel],
  ];
  for (const r of rows) {
    out.push(hasDetails ? [r.label, r.value, r.sublabel ?? ""] : [r.label, r.value]);
  }
  return toCsv(out);
}
