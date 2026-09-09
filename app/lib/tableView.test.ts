import { describe, expect, it } from "vitest";
import {
  applyTableView,
  filterRows,
  INITIAL_TABLE_VIEW,
  nextSort,
  sortRows,
  type TableRow,
} from "./tableView";

const rows: TableRow[] = [
  { label: "/pricing", value: 120, sublabel: "Pricing" },
  { label: "/", value: 900, sublabel: "Home" },
  { label: "/blog/guide", value: 300, sublabel: "Guide" },
  { label: "/about", value: 120, sublabel: "About us" },
];

describe("filterRows", () => {
  it("keeps everything for a blank or whitespace query", () => {
    expect(filterRows(rows, "")).toHaveLength(4);
    expect(filterRows(rows, "   ")).toHaveLength(4);
  });

  it("matches the label, case-insensitively", () => {
    expect(filterRows(rows, "BLOG").map((r) => r.label)).toEqual(["/blog/guide"]);
  });

  it("matches the sublabel too", () => {
    expect(filterRows(rows, "home").map((r) => r.label)).toEqual(["/"]);
  });

  it("returns nothing when there's no match", () => {
    expect(filterRows(rows, "zzz")).toEqual([]);
  });
});

describe("sortRows", () => {
  it("sorts by value descending", () => {
    expect(sortRows(rows, "value", "desc").map((r) => r.value)).toEqual([900, 300, 120, 120]);
  });

  it("sorts by value ascending", () => {
    expect(sortRows(rows, "value", "asc").map((r) => r.value)).toEqual([120, 120, 300, 900]);
  });

  it("breaks value ties by label so order is stable, not arbitrary", () => {
    const tied = sortRows(rows, "value", "desc").filter((r) => r.value === 120);
    expect(tied.map((r) => r.label)).toEqual(["/about", "/pricing"]);
  });

  it("sorts by label A→Z and Z→A", () => {
    expect(sortRows(rows, "label", "asc").map((r) => r.label)).toEqual([
      "/",
      "/about",
      "/blog/guide",
      "/pricing",
    ]);
    expect(sortRows(rows, "label", "desc").map((r) => r.label)[0]).toBe("/pricing");
  });

  it("never mutates the caller's array", () => {
    const original = [...rows];
    sortRows(rows, "value", "asc");
    expect(rows).toEqual(original);
  });
});

describe("applyTableView", () => {
  it("defaults to biggest values first", () => {
    const res = applyTableView(rows, INITIAL_TABLE_VIEW);
    expect(res.rows[0].value).toBe(900);
    expect(res.total).toBe(4);
    expect(res.pageCount).toBe(1);
  });

  it("paginates and reports page count", () => {
    const res = applyTableView(rows, { ...INITIAL_TABLE_VIEW, pageSize: 2 });
    expect(res.rows.map((r) => r.value)).toEqual([900, 300]);
    expect(res.pageCount).toBe(2);

    const p2 = applyTableView(rows, { ...INITIAL_TABLE_VIEW, pageSize: 2, page: 1 });
    expect(p2.rows.map((r) => r.value)).toEqual([120, 120]);
  });

  it("clamps a page index stranded past the end by a search", () => {
    // On page 3, then the user searches something with one hit.
    const res = applyTableView(rows, {
      ...INITIAL_TABLE_VIEW,
      pageSize: 2,
      page: 5,
      query: "blog",
    });
    expect(res.page).toBe(0);
    expect(res.rows.map((r) => r.label)).toEqual(["/blog/guide"]);
  });

  it("returns a usable shape when nothing matches", () => {
    const res = applyTableView(rows, { ...INITIAL_TABLE_VIEW, query: "zzz" });
    expect(res.rows).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.pageCount).toBe(1);
    expect(res.page).toBe(0);
  });

  it("exposes all matched rows (not just the page) for CSV export", () => {
    const res = applyTableView(rows, { ...INITIAL_TABLE_VIEW, pageSize: 2 });
    expect(res.rows).toHaveLength(2);
    expect(res.matched).toHaveLength(4);
  });

  it("survives a pageSize of 0 instead of dividing by zero", () => {
    const res = applyTableView(rows, { ...INITIAL_TABLE_VIEW, pageSize: 0 });
    expect(res.rows).toHaveLength(1);
    expect(res.pageCount).toBe(4);
  });
});

describe("nextSort", () => {
  it("starts values high→low and names A→Z on first click", () => {
    expect(nextSort({ sortKey: "label", sortDir: "asc" }, "value")).toEqual({
      sortKey: "value",
      sortDir: "desc",
    });
    expect(nextSort({ sortKey: "value", sortDir: "desc" }, "label")).toEqual({
      sortKey: "label",
      sortDir: "asc",
    });
  });

  it("toggles direction when the same column is clicked again", () => {
    expect(nextSort({ sortKey: "value", sortDir: "desc" }, "value")).toEqual({
      sortKey: "value",
      sortDir: "asc",
    });
    expect(nextSort({ sortKey: "value", sortDir: "asc" }, "value")).toEqual({
      sortKey: "value",
      sortDir: "desc",
    });
  });
});
