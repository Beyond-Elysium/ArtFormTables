/**
 * Client for the semantic-layer service (boring-semantic-layer + DuckDB).
 *
 * Server-side only: the Next app calls the service with a bearer token so
 * viewers never hold a credential. Degrades gracefully — when
 * SEMANTIC_API_URL is unset it returns null and callers fall back.
 *
 * Powers cross-filtering, drill-downs, dynamic calculations, and (later) NLQ:
 * each interaction is just a different query against the same defined
 * dimensions/measures.
 */
import "server-only";
import { http } from "@/lib/connectors/http";

export type SemanticOp = "=" | "!=" | ">" | ">=" | "<" | "<=" | "in";

export interface SemanticFilter {
  field: string;
  op?: SemanticOp;
  value: unknown;
}

export interface SemanticQuery {
  model: string;
  dimensions?: string[];
  measures?: string[];
  filters?: SemanticFilter[];
  timeRange?: { start?: string; end?: string };
  orderBy?: [string, "asc" | "desc"][];
  limit?: number;
}

export interface SemanticResult {
  model: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface SemanticModelSchema {
  dimensions: string[];
  measures: string[];
  time_dimension: string | null;
}

export function semanticConfigured(): boolean {
  return Boolean(process.env.SEMANTIC_API_URL);
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.SEMANTIC_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.SEMANTIC_API_TOKEN}`;
  }
  return headers;
}

/** Run a semantic query. Returns null if the service is unconfigured or errors. */
export async function semanticQuery(q: SemanticQuery): Promise<SemanticResult | null> {
  const base = process.env.SEMANTIC_API_URL;
  if (!base) return null;
  try {
    return await http<SemanticResult>(`${base}/query`, {
      method: "POST",
      headers: authHeaders(),
      body: {
        model: q.model,
        dimensions: q.dimensions ?? [],
        measures: q.measures ?? [],
        filters: q.filters ?? [],
        time_range: q.timeRange ?? null,
        order_by: q.orderBy ?? null,
        limit: q.limit ?? 1000,
      },
      responseType: "json",
    });
  } catch (err) {
    console.error("[semantic] query failed:", err);
    return null;
  }
}

export interface SemanticOutcome {
  ok: boolean;
  result?: SemanticResult;
  /** HTTP-ish status to relay to the caller. */
  status: number;
  /** Human-readable reason (upstream detail) when !ok. */
  message?: string;
}

/** Pull a readable status + message out of an ofetch error. */
function errorDetail(err: unknown): { status: number; message: string } {
  const e = err as { status?: number; statusCode?: number; data?: unknown; message?: string };
  const status = e?.status ?? e?.statusCode ?? 502;
  const data = e?.data as { detail?: unknown } | string | undefined;
  const detail =
    (typeof data === "object" && data && "detail" in data ? data.detail : data) ??
    e?.message ??
    String(err);
  return { status, message: typeof detail === "string" ? detail : JSON.stringify(detail) };
}

/** Query and surface the upstream failure reason (used by the proxy route). */
export async function runSemanticQuery(q: SemanticQuery): Promise<SemanticOutcome> {
  const base = process.env.SEMANTIC_API_URL;
  if (!base) return { ok: false, status: 503, message: "SEMANTIC_API_URL not set" };
  try {
    const result = await http<SemanticResult>(`${base}/query`, {
      method: "POST",
      headers: authHeaders(),
      body: {
        model: q.model,
        dimensions: q.dimensions ?? [],
        measures: q.measures ?? [],
        filters: q.filters ?? [],
        time_range: q.timeRange ?? null,
        order_by: q.orderBy ?? null,
        limit: q.limit ?? 1000,
      },
      responseType: "json",
    });
    return { ok: true, result, status: 200 };
  } catch (err) {
    const { status, message } = errorDetail(err);
    console.error(`[semantic] query failed (${status}):`, message);
    return { ok: false, status, message };
  }
}

/** Connection check: pings the service /health and reports what it sees. */
export async function semanticHealth(): Promise<{
  ok: boolean;
  url?: string;
  status?: number;
  models?: string[];
  message?: string;
}> {
  const base = process.env.SEMANTIC_API_URL;
  if (!base) return { ok: false, message: "SEMANTIC_API_URL not set" };
  try {
    const data = await http<{ ok?: boolean; models?: string[] }>(`${base}/health`, {
      headers: authHeaders(),
      responseType: "json",
      timeout: 8000,
    });
    return { ok: true, url: base, models: data.models ?? [] };
  } catch (err) {
    const { status, message } = errorDetail(err);
    return { ok: false, url: base, status, message };
  }
}

/** The available models and their dimensions/measures (for UI + NLQ). */
export async function semanticModels(): Promise<Record<string, SemanticModelSchema> | null> {
  const base = process.env.SEMANTIC_API_URL;
  if (!base) return null;
  try {
    return await http<Record<string, SemanticModelSchema>>(`${base}/models`, {
      headers: authHeaders(),
      responseType: "json",
    });
  } catch (err) {
    console.error("[semantic] models fetch failed:", err);
    return null;
  }
}
