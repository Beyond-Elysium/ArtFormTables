/**
 * Geography helpers — turning a provider's geo labels into the region codes
 * map panels need.
 *
 * Two code spaces are in play:
 *   - **World map**: ISO 3166-1 alpha-2 country codes (`US`, `GB`, `DE`). GA4's
 *     `countryId` dimension already returns exactly these, so no mapping is
 *     needed — see `ga4.ts`.
 *   - **US map**: ISO 3166-2 subdivision codes (`US-VA`, `US-CA`). GA4's
 *     `region` dimension returns *names* ("Virginia"), so the lookup below
 *     bridges the two.
 *
 * Kept free of side effects and `server-only` so it unit-tests cleanly.
 */

/** US state (+ DC) name → ISO 3166-2 code, matching the vendored us-mill map. */
const US_STATE_CODES: Record<string, string> = {
  alabama: "US-AL",
  alaska: "US-AK",
  arizona: "US-AZ",
  arkansas: "US-AR",
  california: "US-CA",
  colorado: "US-CO",
  connecticut: "US-CT",
  delaware: "US-DE",
  "district of columbia": "US-DC",
  florida: "US-FL",
  georgia: "US-GA",
  hawaii: "US-HI",
  idaho: "US-ID",
  illinois: "US-IL",
  indiana: "US-IN",
  iowa: "US-IA",
  kansas: "US-KS",
  kentucky: "US-KY",
  louisiana: "US-LA",
  maine: "US-ME",
  maryland: "US-MD",
  massachusetts: "US-MA",
  michigan: "US-MI",
  minnesota: "US-MN",
  mississippi: "US-MS",
  missouri: "US-MO",
  montana: "US-MT",
  nebraska: "US-NE",
  nevada: "US-NV",
  "new hampshire": "US-NH",
  "new jersey": "US-NJ",
  "new mexico": "US-NM",
  "new york": "US-NY",
  "north carolina": "US-NC",
  "north dakota": "US-ND",
  ohio: "US-OH",
  oklahoma: "US-OK",
  oregon: "US-OR",
  pennsylvania: "US-PA",
  "rhode island": "US-RI",
  "south carolina": "US-SC",
  "south dakota": "US-SD",
  tennessee: "US-TN",
  texas: "US-TX",
  utah: "US-UT",
  vermont: "US-VT",
  virginia: "US-VA",
  washington: "US-WA",
  "west virginia": "US-WV",
  wisconsin: "US-WI",
  wyoming: "US-WY",
};

/**
 * ISO 3166-2 code for a US state name, or undefined when it isn't one of the
 * 50 states + DC.
 *
 * GA4's `region` dimension also emits values the US map has no region for —
 * territories (Puerto Rico, Guam), "(not set)" for unresolved geo, and the
 * state names of *other* countries when the report isn't country-filtered.
 * Returning undefined for those lets callers drop them rather than plotting a
 * region that doesn't exist on the map.
 */
export function usStateCode(regionName: string | undefined): string | undefined {
  if (!regionName) return undefined;
  return US_STATE_CODES[regionName.trim().toLowerCase()];
}

/** Every US region code the vendored map can render (50 states + DC). */
export function allUsStateCodes(): string[] {
  return Object.values(US_STATE_CODES);
}
