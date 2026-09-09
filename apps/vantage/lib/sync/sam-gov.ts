import type { OpportunityCreateInput, SolicitationType } from "./types";

/**
 * SAM.gov Opportunities API v2 response shape, as documented at
 * https://open.gsa.gov/api/get-opportunities-public-api/
 *
 * Field naming is inconsistent in the real API (e.g. `responseDeadLine` has an
 * unexpected capital L/D) — that's not a typo below, it's the actual wire format.
 */
export interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string | null;
  fullParentPathName?: string | null;
  department?: string | null;
  subTier?: string | null;
  office?: string | null;
  postedDate?: string | null;
  /** e.g. "Solicitation" | "Sources Sought" | "Presolicitation" | "Award Notice" | ... */
  type?: string | null;
  baseType?: string | null;
  typeOfSetAsideDescription?: string | null;
  typeOfSetAside?: string | null;
  /** ISO 8601 with offset, e.g. "2026-02-01T17:00:00-05:00". Misspelled/miscased in the real API. */
  responseDeadLine?: string | null;
  naicsCode?: string | null;
  classificationCode?: string | null;
  active?: string | null;
  description?: string | null;
  uiLink: string;
}

interface SamSearchResponse {
  totalRecords: number;
  limit: number;
  offset: number;
  opportunitiesData: SamOpportunity[];
}

interface SamErrorBody {
  error?: { code?: string; message?: string };
  errorMessage?: string;
  message?: string;
}

const SAM_BASE_URL = "https://api.sam.gov/opportunities/v2/search";
/** SAM.gov's documented hard cap on `limit` — asking for more is rejected. */
const MAX_PAGE_SIZE = 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export class SamGovApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "SamGovApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** SAM.gov wants MM/dd/yyyy, not ISO — a different format than USASpending's YYYY-MM-DD. */
function formatSamDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

async function parseErrorBody(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as SamErrorBody;
    return body.error?.message ?? body.errorMessage ?? body.message ?? text;
  } catch {
    return text || res.statusText;
  }
}

async function fetchPage(
  apiKey: string,
  naicsCode: string,
  postedFrom: Date,
  postedTo: Date,
  offset: number,
  procurementType?: string,
): Promise<SamSearchResponse> {
  const url = new URL(SAM_BASE_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("postedFrom", formatSamDate(postedFrom));
  url.searchParams.set("postedTo", formatSamDate(postedTo));
  url.searchParams.set("ncode", naicsCode);
  url.searchParams.set("limit", String(MAX_PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  if (procurementType) url.searchParams.set("ptype", procurementType);

  const res = await fetch(url.toString());

  if (res.status === 401) {
    throw new SamGovApiError(
      `SAM.gov rejected the API key (401): ${await parseErrorBody(res)}`,
      401,
    );
  }
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    throw new SamGovApiError(
      `SAM.gov rate limit exceeded (429)${
        retryAfterSeconds ? ` — retry after ${retryAfterSeconds}s` : ""
      }: ${await parseErrorBody(res)}`,
      429,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
    );
  }
  if (!res.ok) {
    throw new SamGovApiError(
      `SAM.gov request failed (${res.status}): ${await parseErrorBody(res)}`,
      res.status,
    );
  }

  return (await res.json()) as SamSearchResponse;
}

async function fetchAllForNaics(
  apiKey: string,
  naicsCode: string,
  postedFrom: Date,
  postedTo: Date,
  procurementType?: string,
): Promise<SamOpportunity[]> {
  const results: SamOpportunity[] = [];
  let offset = 0;

  // SAM.gov doesn't return a "next page" cursor — you page by offset until a
  // page comes back shorter than the requested limit.
  while (true) {
    const page = await fetchPage(apiKey, naicsCode, postedFrom, postedTo, offset, procurementType);
    const batch = page.opportunitiesData ?? [];
    results.push(...batch);
    if (batch.length < MAX_PAGE_SIZE) break;
    offset += MAX_PAGE_SIZE;
  }

  return results;
}

export interface FetchSamOpportunitiesParams {
  apiKey: string;
  naicsCodes: string[];
  postedFrom: Date;
  postedTo: Date;
  /** Optional SAM.gov procurement type filter (`ptype`), e.g. "o" for Solicitation. */
  procurementType?: string;
}

/**
 * Fetches SAM.gov opportunities for each NAICS code (the API accepts only one
 * `ncode` per request) and de-duplicates the combined results by `noticeId` —
 * the same notice can legitimately carry more than one NAICS code and would
 * otherwise show up once per code searched.
 */
export async function fetchSamOpportunities(
  params: FetchSamOpportunitiesParams,
): Promise<SamOpportunity[]> {
  const { apiKey, naicsCodes, postedFrom, postedTo, procurementType } = params;

  if (postedTo.getTime() - postedFrom.getTime() > ONE_YEAR_MS) {
    throw new Error(
      "SAM.gov Opportunities API rejects date ranges over 1 year per call — split the range across multiple calls.",
    );
  }

  const byNoticeId = new Map<string, SamOpportunity>();

  for (const naicsCode of naicsCodes) {
    const opportunities = await fetchAllForNaics(
      apiKey,
      naicsCode,
      postedFrom,
      postedTo,
      procurementType,
    );
    for (const opp of opportunities) {
      byNoticeId.set(opp.noticeId, opp);
    }
  }

  return Array.from(byNoticeId.values());
}

/**
 * SAM.gov's `type` field is free-text-ish and its casing/wording doesn't match
 * our schema's enum. This is the explicit mapping table — keep it exhaustive
 * as new notice types are observed in the wild rather than guessing at a
 * transform function.
 */
export const SAM_TYPE_TO_SOLICITATION_TYPE: Record<string, SolicitationType> = {
  Solicitation: "solicitation",
  "Sources Sought": "sources_sought",
  Presolicitation: "pre_solicitation",
  "Award Notice": "award_notice",
  "Combined Synopsis/Solicitation": "combined_synopsis_solicitation",
  "Special Notice": "special_notice",
};

export function mapSolicitationType(rawType: string | null | undefined): SolicitationType {
  if (!rawType) return "other";
  return SAM_TYPE_TO_SOLICITATION_TYPE[rawType] ?? "other";
}

export function mapSamOpportunityToRow(
  raw: SamOpportunity,
  workspaceId: string,
): OpportunityCreateInput {
  return {
    workspaceId,
    samOpportunityId: raw.noticeId,
    title: raw.title,
    // fullParentPathName is the dotted agency hierarchy (e.g.
    // "DEPT OF DEFENSE.DEPT OF THE ARMY.W6QK ACC-APG"); fall back to the
    // flatter `department` field when it's missing.
    agency: raw.fullParentPathName ?? raw.department ?? "Unknown Agency",
    subAgency: raw.subTier ?? null,
    naicsCode: raw.naicsCode ?? null,
    solicitationType: mapSolicitationType(raw.type),
    proposalDueDate: raw.responseDeadLine ? new Date(raw.responseDeadLine) : null,
    samUrl: raw.uiLink,
    notes: raw.description ?? null,
  };
}
