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
import { getClientBySlug } from "@/config/clients";
import { clientScopeDecision, forceClientFilter } from "@/lib/explore";

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

// The /models schema is fetched to verify a model is client-scoped before
// every query; cache it briefly so interactive Explore clicks don't double
// the request count. Only successful fetches are cached.
let schemaCache: { at: number; value: Record<string, SemanticModelSchema> } | null = null;
const SCHEMA_TTL_MS = 60_000;

async function cachedModels(): Promise<Record<string, SemanticModelSchema> | null> {
  const now = Date.now();
  if (schemaCache && now - schemaCache.at < SCHEMA_TTL_MS) return schemaCache.value;
  const value = await semanticModels();
  if (value) schemaCache = { at: now, value };
  return value;
}

/**
 * Run a query scoped to one client, surfacing the upstream failure reason
 * (used by the proxy route and server-side panels).
 *
 * SECURITY (finding E5): `clientSlug` is required and is force-injected as a
 * `client = slug` filter into every query against a client-partitioned model —
 * overwriting any caller-supplied client filter — so no caller (browser or
 * internal) can read another client's rows with the shared bearer token.
 * Models without a client dimension are rejected unless allowlisted in
 * SHARED_SEMANTIC_MODELS (lib/explore.ts).
 */
export async function runSemanticQuery(
  q: SemanticQuery,
  clientSlug: string,
): Promise<SemanticOutcome> {
  const base = process.env.SEMANTIC_API_URL;
  if (!base) return { ok: false, status: 503, message: "SEMANTIC_API_URL not set" };
  if (!getClientBySlug(clientSlug)) {
    return { ok: false, status: 400, message: `unknown client '${clientSlug}'` };
  }
  const decision = clientScopeDecision(q.model, await cachedModels());
  if (decision.action === "reject") {
    return { ok: false, status: decision.status, message: decision.reason };
  }
  const query = decision.action === "scope" ? forceClientFilter(q, clientSlug) : q;
  try {
    const result = await http<SemanticResult>(`${base}/query`, {
      method: "POST",
      headers: authHeaders(),
      body: {
        model: query.model,
        dimensions: query.dimensions ?? [],
        measures: query.measures ?? [],
        filters: query.filters ?? [],
        time_range: query.timeRange ?? null,
        order_by: query.orderBy ?? null,
        limit: query.limit ?? 1000,
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

/**
 * Auth probe: the service checks the bearer BEFORE it validates the body, so a
 * request with a nonsense model returns 401 on a bad token and 404 on a good
 * one. Lets the health check confirm the token WITHOUT any valid query.
 */
async function probeAuth(base: string): Promise<"ok" | "unauthorized" | "unknown"> {
  try {
    await http(`${base}/query`, {
      method: "POST",
      headers: authHeaders(),
      body: { model: "__auth_probe__" },
      responseType: "json",
      timeout: 8000,
    });
    return "ok"; // 2xx (unexpected but fine)
  } catch (err) {
    const { status } = errorDetail(err);
    if (status === 401 || status === 403) return "unauthorized";
    if (status >= 400) return "ok"; // 404/422/etc. → auth passed, body rejected
    return "unknown";
  }
}

/**
 * Connection check: pings /health (open) AND probes /query auth, so it reports
 * reachability, the model list, and whether the configured token is accepted.
 */
export async function semanticHealth(): Promise<{
  ok: boolean;
  url?: string;
  status?: number;
  models?: string[];
  auth?: "ok" | "unauthorized" | "unknown";
  tokenSet?: boolean;
  message?: string;
}> {
  const base = process.env.SEMANTIC_API_URL;
  if (!base) return { ok: false, message: "SEMANTIC_API_URL not set" };
  const tokenSet = Boolean(process.env.SEMANTIC_API_TOKEN);
  try {
    const data = await http<{ ok?: boolean; models?: string[] }>(`${base}/health`, {
      headers: authHeaders(),
      responseType: "json",
      timeout: 8000,
    });
    const auth = await probeAuth(base);
    return {
      ok: auth !== "unauthorized",
      url: base,
      models: data.models ?? [],
      auth,
      tokenSet,
      ...(auth === "unauthorized"
        ? { message: "token rejected by service — SEMANTIC_API_TOKEN mismatch" }
        : {}),
    };
  } catch (err) {
    const { status, message } = errorDetail(err);
    return { ok: false, url: base, status, tokenSet, message };
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
