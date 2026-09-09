"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { objectiveLabels, sectorLabels, type Objective, type Sector } from "@/lib/enums";

export interface ScenarioListItem {
  id: string;
  name: string;
  objective: Objective;
  sector: Sector;
  budget: number;
  influenceScore: number;
  status: "active" | "archived";
  createdAt: string;
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));
}

/** Client-side search/filter/compare/archive over a server-fetched scenario list. */
export function ScenariosList({ scenarios }: { scenarios: ScenarioListItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(scenarios);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((s) => {
      if (status !== "all" && s.status !== status) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, status]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function archive(id: string) {
    setArchiving(id);
    try {
      const res = await fetch(`/api/scenarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((s) => (s.id === id ? { ...s, status: "archived" as const } : s)));
      }
    } finally {
      setArchiving(null);
    }
  }

  function compare() {
    router.push(`/scenarios/compare?ids=${Array.from(selected).join(",")}`);
  }

  return (
    <>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <input
          className="form-control"
          style={{ maxWidth: 260 }}
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-select"
          style={{ maxWidth: 180 }}
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | "active" | "archived")}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <button type="button" className="btn btn-outline-primary ms-auto" disabled={selected.size < 2} onClick={compare}>
          Compare {selected.size > 0 ? `(${selected.size})` : ""}
        </button>
      </div>

      <div className="table-responsive">
        <table className="table table-vcenter card-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Name</th>
              <th>Objective</th>
              <th>Sector</th>
              <th>Budget</th>
              <th>Influence Score</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={selected.has(s.id)}
                    onChange={() => toggleSelected(s.id)}
                    aria-label={`Select ${s.name} to compare`}
                  />
                </td>
                <td>
                  <Link href={`/scenarios/${s.id}`}>{s.name}</Link>
                </td>
                <td>{objectiveLabels[s.objective]}</td>
                <td>{sectorLabels[s.sector]}</td>
                <td>{currency(s.budget)}</td>
                <td>{Math.round(s.influenceScore)}</td>
                <td>
                  <span className={`badge ${s.status === "active" ? "bg-green-lt text-green" : "bg-secondary-lt text-secondary"}`}>
                    {s.status}
                  </span>
                </td>
                <td>{dateLabel(s.createdAt)}</td>
                <td className="text-end">
                  {s.status === "active" && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => archive(s.id)}
                      disabled={archiving === s.id}
                    >
                      {archiving === s.id ? "Archiving…" : "Archive"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-secondary py-4">
                  No scenarios match your search/filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
