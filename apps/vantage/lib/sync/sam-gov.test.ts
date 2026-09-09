import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SAM_TYPE_TO_SOLICITATION_TYPE,
  SamGovApiError,
  fetchSamOpportunities,
  mapSamOpportunityToRow,
  mapSolicitationType,
  type SamOpportunity,
} from "./sam-gov";
import fixture from "./__fixtures__/sam-opportunities-response.json";

const [solicitationFixture, sourcesSoughtFixture, awardNoticeFixture] = fixture.opportunitiesData;

function emptyPageResponse() {
  return { totalRecords: 0, limit: 1000, offset: 0, opportunitiesData: [] };
}

function jsonResponse(body: unknown, init: Partial<Response> = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
    ...init,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapSolicitationType", () => {
  it("maps all 4 known SAM.gov type values", () => {
    expect(mapSolicitationType("Solicitation")).toBe("solicitation");
    expect(mapSolicitationType("Sources Sought")).toBe("sources_sought");
    expect(mapSolicitationType("Presolicitation")).toBe("pre_solicitation");
    expect(mapSolicitationType("Award Notice")).toBe("award_notice");
  });

  it("falls back to other for an unrecognized type", () => {
    expect(mapSolicitationType("Justification and Approval (J&A)")).toBe("other");
    expect(mapSolicitationType(null)).toBe("other");
    expect(mapSolicitationType(undefined)).toBe("other");
  });

  it("keeps the mapping table exhaustive for the 4 known values", () => {
    for (const known of ["Solicitation", "Sources Sought", "Presolicitation", "Award Notice"]) {
      expect(SAM_TYPE_TO_SOLICITATION_TYPE[known]).toBeDefined();
    }
  });
});

describe("mapSamOpportunityToRow", () => {
  it("maps a Solicitation-type fixture to the internal row shape", () => {
    const row = mapSamOpportunityToRow(solicitationFixture as SamOpportunity, "ws_1");

    expect(row).toMatchObject({
      workspaceId: "ws_1",
      samOpportunityId: "a1b2c3d4e5f6",
      title: "Enterprise IT Support Services",
      agency: "DEPT OF DEFENSE.DEPT OF THE ARMY.ACC-APG",
      subAgency: "DEPT OF THE ARMY",
      naicsCode: "541511",
      solicitationType: "solicitation",
      samUrl: "https://sam.gov/opp/a1b2c3d4e5f6/view",
    });
    expect(row.proposalDueDate).toEqual(new Date("2026-09-30T17:00:00-04:00"));
  });

  it("maps a Sources Sought fixture correctly", () => {
    const row = mapSamOpportunityToRow(sourcesSoughtFixture as SamOpportunity, "ws_1");
    expect(row.solicitationType).toBe("sources_sought");
    expect(row.agency).toBe("GENERAL SERVICES ADMINISTRATION.FEDERAL ACQUISITION SERVICE");
  });

  it("maps an Award Notice fixture with a null due date", () => {
    const row = mapSamOpportunityToRow(awardNoticeFixture as SamOpportunity, "ws_1");
    expect(row.solicitationType).toBe("award_notice");
    expect(row.proposalDueDate).toBeNull();
  });

  it("falls back to `department` when fullParentPathName is missing", () => {
    const raw: SamOpportunity = {
      noticeId: "z9",
      title: "No Path Name",
      department: "DEPT OF ENERGY",
      uiLink: "https://sam.gov/opp/z9/view",
    };
    expect(mapSamOpportunityToRow(raw, "ws_1").agency).toBe("DEPT OF ENERGY");
  });
});

describe("fetchSamOpportunities", () => {
  it("stops paginating once a page returns fewer than the page size", async () => {
    const fullPage = {
      totalRecords: 1005,
      limit: 1000,
      offset: 0,
      opportunitiesData: Array.from({ length: 1000 }, (_, i) => ({
        noticeId: `notice-${i}`,
        title: `Opportunity ${i}`,
        uiLink: `https://sam.gov/opp/notice-${i}/view`,
      })),
    };
    const shortPage = {
      totalRecords: 1005,
      limit: 1000,
      offset: 1000,
      opportunitiesData: Array.from({ length: 5 }, (_, i) => ({
        noticeId: `notice-tail-${i}`,
        title: `Opportunity tail ${i}`,
        uiLink: `https://sam.gov/opp/notice-tail-${i}/view`,
      })),
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(fullPage))
      .mockResolvedValueOnce(jsonResponse(shortPage));
    vi.stubGlobal("fetch", fetchMock);

    const results = await fetchSamOpportunities({
      apiKey: "test-key",
      naicsCodes: ["541511"],
      postedFrom: new Date("2026-08-01"),
      postedTo: new Date("2026-09-01"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1005);

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(firstUrl.searchParams.get("offset")).toBe("0");
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(secondUrl.searchParams.get("offset")).toBe("1000");
  });

  it("de-duplicates opportunities that appear under more than one NAICS code", async () => {
    const sharedNotice: SamOpportunity = {
      noticeId: "shared-1",
      title: "Shared across NAICS codes",
      uiLink: "https://sam.gov/opp/shared-1/view",
    };
    const onlyUnderSecondCode: SamOpportunity = {
      noticeId: "only-2",
      title: "Only under second NAICS code",
      uiLink: "https://sam.gov/opp/only-2/view",
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ ...emptyPageResponse(), opportunitiesData: [sharedNotice] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...emptyPageResponse(),
          opportunitiesData: [sharedNotice, onlyUnderSecondCode],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const results = await fetchSamOpportunities({
      apiKey: "test-key",
      naicsCodes: ["541511", "541512"],
      postedFrom: new Date("2026-08-01"),
      postedTo: new Date("2026-09-01"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.noticeId).sort()).toEqual(["only-2", "shared-1"]);
  });

  it("formats postedFrom/postedTo as MM/dd/yyyy and sets one ncode per request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(emptyPageResponse()));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSamOpportunities({
      apiKey: "test-key",
      naicsCodes: ["541511"],
      postedFrom: new Date(Date.UTC(2026, 7, 1)),
      postedTo: new Date(Date.UTC(2026, 8, 1)),
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("postedFrom")).toBe("08/01/2026");
    expect(url.searchParams.get("postedTo")).toBe("09/01/2026");
    expect(url.searchParams.get("ncode")).toBe("541511");
    expect(url.searchParams.get("api_key")).toBe("test-key");
  });

  it("rejects a date range spanning more than one year", async () => {
    await expect(
      fetchSamOpportunities({
        apiKey: "test-key",
        naicsCodes: ["541511"],
        postedFrom: new Date("2024-01-01"),
        postedTo: new Date("2026-01-02"),
      }),
    ).rejects.toThrow(/1 year/);
  });

  it("throws SamGovApiError with a retry-after hint on 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "retry-after": "30" }),
      json: async () => ({ error: { code: "RATE_LIMIT", message: "Too many requests" } }),
      text: async () => JSON.stringify({ error: { code: "RATE_LIMIT", message: "Too many requests" } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSamOpportunities({
        apiKey: "test-key",
        naicsCodes: ["541511"],
        postedFrom: new Date("2026-08-01"),
        postedTo: new Date("2026-09-01"),
      }),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 30 });
  });

  it("throws SamGovApiError on a bad API key (401)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ error: { code: "API_KEY_INVALID", message: "Invalid api_key" } }),
      text: async () => JSON.stringify({ error: { code: "API_KEY_INVALID", message: "Invalid api_key" } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchSamOpportunities({
      apiKey: "bad-key",
      naicsCodes: ["541511"],
      postedFrom: new Date("2026-08-01"),
      postedTo: new Date("2026-09-01"),
    });

    await expect(promise).rejects.toBeInstanceOf(SamGovApiError);
    await expect(promise).rejects.toMatchObject({ status: 401 });
  });
});
