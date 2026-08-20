/**
 * Breakdown-table view state — pure search / sort / paginate logic.
 *
 * Connectors emit breakdown rows (`{ label, value, sublabel? }`) with no view
 * concerns; this turns a row list plus a bit of UI state into exactly what one
 * table body should render. Kept pure (no imports with side effects, no
 * "server-only") so it runs in the client-side PanelSection and in unit tests
 * alike — the same split as lib/views.ts and components/mapScale.ts.
 *
 * Why not a table library: every breakdown is the same fixed two-column shape,
 * so sorting/filtering/paging is a few lines of array work. A headless table
 * lib would add a dependency and a second rendering path for print (where
 * interactive state is meaningless) without removing any real complexity.
 */

export interface TableRow {
  label: string;
  value: number;
  sublabel?: string;
}

export type SortKey = "label" | "value";
export type SortDir = "asc" | "desc";

export interface TableViewState {
  /** Free-text search over label + sublabel. */
  query: string;
  sortKey: SortKey;
  sortDir: SortDir;
  /** Zero-based. */
  page: number;
  pageSize: number;
}

export interface TableViewResult {
  /** The rows this page should render. */
  rows: TableRow[];
  /** Rows matching the query, before pagination (what CSV export uses). */
  matched: TableRow[];
  /** Total rows after filtering. */
  total: number;
  /** Number of pages (at least 1, so an empty result still reads "1 of 1"). */
  pageCount: number;
  /** The page actually rendered — clamped into range. */
  page: number;
}

/**
 * Default rows per page. The body scrolls (about five rows tall), so this is
 * "how many before you need the pager", not "how many are visible". Matches
 * the row cap connectors already apply, so paging only appears for the
 * genuinely long tables (e.g. a big Google Sheet).
 */
export const DEFAULT_PAGE_SIZE = 25;

/** The view a table starts in: unsearched, biggest values first, first page. */
export const INITIAL_TABLE_VIEW: TableViewState = {
  query: "",
  sortKey: "value",
  sortDir: "desc",
  page: 0,
  pageSize: DEFAULT_PAGE_SIZE,
};

/** Case-insensitive match against label or sublabel. Blank query keeps everything. */
export function filterRows(rows: TableRow[], query: string): TableRow[] {
  const q = query.trim().toLowerCase();
  if (q === "") return rows;
  return rows.filter(
    (r) =>
      r.label.toLowerCase().includes(q) || (r.sublabel ?? "").toLowerCase().includes(q),
  );
}

/**
 * Sort by value (numeric) or label (locale-aware, case-insensitive).
 * Returns a new array — never mutates the connector's rows.
 */
export function sortRows(rows: TableRow[], key: SortKey, dir: SortDir): TableRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "value") {
      // Ties keep a stable, meaningful order by falling back to the label.
      if (a.value !== b.value) return (a.value - b.value) * factor;
      return a.label.localeCompare(b.label);
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) * factor;
  });
}

/** Filter → sort → paginate, with the page clamped into range. */
export function applyTableView(rows: TableRow[], state: TableViewState): TableViewResult {
  const matched = sortRows(filterRows(rows, state.query), state.sortKey, state.sortDir);
  const size = Math.max(1, state.pageSize);
  const pageCount = Math.max(1, Math.ceil(matched.length / size));
  // A search that shrinks the result set can strand the page index past the
  // end — clamp rather than render an empty table.
  const page = Math.min(Math.max(0, state.page), pageCount - 1);
  return {
    rows: matched.slice(page * size, page * size + size),
    matched,
    total: matched.length,
    pageCount,
    page,
  };
}

/** The sort direction a header click should produce. */
export function nextSort(
  current: { sortKey: SortKey; sortDir: SortDir },
  clicked: SortKey,
): { sortKey: SortKey; sortDir: SortDir } {
  if (current.sortKey !== clicked) {
    // First click on a new column: values start high→low, names start A→Z.
    return { sortKey: clicked, sortDir: clicked === "value" ? "desc" : "asc" };
  }
  return { sortKey: clicked, sortDir: current.sortDir === "asc" ? "desc" : "asc" };
}
