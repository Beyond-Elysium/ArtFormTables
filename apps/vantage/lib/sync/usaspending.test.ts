import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UsaSpendingApiError,
  fetchRecentAwards,
  mapAwardToCompetitorActivity,
  type AwardRecord,
} from "./usaspending";
import fixture from "./__fixtures__/usaspending-spending-by-award-response.json";

const [dodAward, gsaAward] = fixture.results;

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapAwardToCompetitorActivity", () => {
  it("maps a DoD award fixture to the internal row shape", () => {
    const row = mapAwardToCompetitorActivity(dodAward as AwardRecord, "ws_1");
    expect(row).toEqual({
      workspaceId: "ws_1",
      awardId: "W912DY-26-C-0042",
      recipientName: "ACME FEDERAL SOLUTIONS LLC",
      awardAmount: 4823110.5,
      startDate: new Date("2026-08-04"),
      awardingAgency: "Department of Defense",
      naicsCode: "541511",
      description: "ENTERPRISE IT SUPPORT AND HELP DESK SERVICES",
    });
  });

  it("maps a GSA award fixture correctly", () => {
    const row = mapAwardToCompetitorActivity(gsaAward as AwardRecord, "ws_1");
    expect(row.awardId).toBe("47QTCA26D0007");
    expect(row.awardingAgency).toBe("General Services Administration");
    expect(row.naicsCode).toBe("541512");
  });

  it("handles missing amount/date/naics gracefully", () => {
    const raw: AwardRecord = {
      "Award ID": "X-1",
      "Recipient Name": "Nobody Inc",
      "Award Amount": null,
      "Start Date": null,
      "Awarding Agency": "Dept of Nothing",
      "NAICS Code": null,
      Description: null,
    };
    const row = mapAwardToCompetitorActivity(raw, "ws_1");
    expect(row.awardAmount).toBeNull();
    expect(row.startDate).toBeNull();
    expect(row.naicsCode).toBeNull();
  });
});

describe("fetchRecentAwards", () => {
  it("builds the documented spending_by_award request shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ limit: 100, results: [], page_metadata: { page: 1, hasNext: false } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchRecentAwards({
      agency: "Department of Defense",
      naicsCode: "541511",
      awardedFrom: new Date(Date.UTC(2026, 7, 1)),
      awardedTo: new Date(Date.UTC(2026, 8, 1)),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.usaspending.gov/api/v2/search/spending_by_award/");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      filters: {
        time_period: [{ start_date: "2026-08-01", end_date: "2026-09-01" }],
        agencies: [{ type: "awarding", tier: "toptier", name: "Department of Defense" }],
        naics_codes: ["541511"],
        award_type_codes: ["A", "B", "C", "D"],
      },
      fields: [
        "Award ID",
        "Recipient Name",
        "Award Amount",
        "Start Date",
        "Awarding Agency",
        "NAICS Code",
        "Description",
      ],
      limit: 100,
      page: 1,
    });
  });

  it("omits naics_codes when no NAICS code is given", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ limit: 100, results: [], page_metadata: { page: 1, hasNext: false } }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRecentAwards({
      agency: "Department of Defense",
      awardedFrom: new Date("2026-08-01"),
      awardedTo: new Date("2026-09-01"),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.filters.naics_codes).toBeUndefined();
  });

  it("paginates while hasNext is true and stops on the final page", async () => {
    const page1 = {
      limit: 100,
      results: Array.from({ length: 100 }, (_, i) => ({
        "Award ID": `A-${i}`,
        "Recipient Name": "Recipient",
        "Award Amount": 1000,
        "Start Date": "2026-08-01",
        "Awarding Agency": "Department of Defense",
        "NAICS Code": "541511",
        Description: "desc",
      })),
      page_metadata: { page: 1, hasNext: true },
    };
    const page2 = {
      limit: 100,
      results: Array.from({ length: 30 }, (_, i) => ({
        "Award ID": `B-${i}`,
        "Recipient Name": "Recipient",
        "Award Amount": 1000,
        "Start Date": "2026-08-01",
        "Awarding Agency": "Department of Defense",
        "NAICS Code": "541511",
        Description: "desc",
      })),
      page_metadata: { page: 2, hasNext: false },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));
    vi.stubGlobal("fetch", fetchMock);

    const results = await fetchRecentAwards({
      agency: "Department of Defense",
      awardedFrom: new Date("2026-08-01"),
      awardedTo: new Date("2026-09-01"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(130);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.page).toBe(2);
  });

  it("throws UsaSpendingApiError on a non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "award_type_codes is a required field",
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchRecentAwards({
      agency: "Department of Defense",
      awardedFrom: new Date("2026-08-01"),
      awardedTo: new Date("2026-09-01"),
    });

    await expect(promise).rejects.toBeInstanceOf(UsaSpendingApiError);
    await expect(promise).rejects.toMatchObject({ status: 422 });
  });
});
