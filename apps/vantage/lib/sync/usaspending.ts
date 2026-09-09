import type { CompetitorActivityCreateInput } from "./types";

/**
 * A single row of USASpending's `spending_by_award` response. Keys are the
 * literal field labels you asked for in the request body's `fields` array —
 * USASpending echoes your requested field names back as object keys rather
 * than using stable camelCase identifiers, so the shape here must track the
 * `fields` list in buildRequestBody() exactly.
 */
export interface AwardRecord {
  internal_id?: number;
  "Award ID": string;
  "Recipient Name": string;
  "Award Amount": number | null;
  "Start Date": string | null;
  "Awarding Agency": string;
  "NAICS Code": string | null;
  Description: string | null;
}

interface SpendingByAwardResponse {
  limit: number;
  results: AwardRecord[];
  page_metadata?: { page: number; hasNext: boolean };
}

const USASPENDING_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const PAGE_SIZE = 100;
/** Belt-and-suspenders cap so a misbehaving API can't spin this into an infinite loop. */
const MAX_PAGES = 50;

const FIELDS = [
  "Award ID",
  "Recipient Name",
  "Award Amount",
  "Start Date",
  "Awarding Agency",
  "NAICS Code",
  "Description",
] as const;

/** USASpending wants YYYY-MM-DD — unlike SAM.gov's MM/dd/yyyy, a different format per API. */
function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class UsaSpendingApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UsaSpendingApiError";
    this.status = status;
  }
}

export interface FetchRecentAwardsParams {
  agency: string;
  naicsCode?: string;
  awardedFrom: Date;
  awardedTo: Date;
}

function buildRequestBody(params: FetchRecentAwardsParams, page: number) {
  return {
    filters: {
      time_period: [
        { start_date: formatIsoDate(params.awardedFrom), end_date: formatIsoDate(params.awardedTo) },
      ],
      agencies: [{ type: "awarding", tier: "toptier", name: params.agency }],
      ...(params.naicsCode ? { naics_codes: [params.naicsCode] } : {}),
      // Required by the live endpoint even though it's easy to miss in the
      // docs' example payloads: spending_by_award 422s with
      // "award_type_codes is a required field" if this is omitted. These four
      // codes cover procurement contracts (as opposed to grants/loans/etc).
      award_type_codes: ["A", "B", "C", "D"],
    },
    fields: FIELDS,
    limit: PAGE_SIZE,
    page,
  };
}

async function fetchPage(
  params: FetchRecentAwardsParams,
  page: number,
): Promise<SpendingByAwardResponse> {
  const res = await fetch(USASPENDING_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody(params, page)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new UsaSpendingApiError(
      `USASpending request failed (${res.status}): ${text || res.statusText}`,
      res.status,
    );
  }

  return (await res.json()) as SpendingByAwardResponse;
}

/** Paginates spending_by_award until `page_metadata.hasNext` is false or a short page is returned. */
export async function fetchRecentAwards(params: FetchRecentAwardsParams): Promise<AwardRecord[]> {
  const results: AwardRecord[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const response = await fetchPage(params, page);
    const batch = response.results ?? [];
    results.push(...batch);

    const hasNext = response.page_metadata?.hasNext ?? batch.length === PAGE_SIZE;
    if (!hasNext || batch.length < PAGE_SIZE) break;
    page += 1;
  }

  return results;
}

export function mapAwardToCompetitorActivity(
  raw: AwardRecord,
  workspaceId: string,
): CompetitorActivityCreateInput {
  return {
    workspaceId,
    awardId: raw["Award ID"],
    competitorName: raw["Recipient Name"],
    awardAmount: raw["Award Amount"] ?? null,
    awardDate: raw["Start Date"] ? new Date(raw["Start Date"]) : null,
    agency: raw["Awarding Agency"],
    naicsCode: raw["NAICS Code"] ?? null,
    contractDescription: raw.Description ?? null,
  };
}
