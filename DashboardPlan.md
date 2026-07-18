# ArtForm Dashboards — Full Audit & Work Plan

_Audited 2026-07-18 against branch `claude/happy-newton-ya2s7o`. Covers the Next.js app (`app/`), the semantic layer (`semantic/`), config, ops, and docs._
_Second pass 2026-07-18: added the UX audit (§2F), landing-page exposure finding (S6), and Phase 6 chunks 30–37._

---

## 0. How to use this document

- **Section 1** is a verified inventory of what exists and works today.
- **Section 2** is the audit — every defect and gap found, ordered by severity, with the "why it matters."
- **Section 3** lists the things only a human can provide (credentials, IDs, decisions). No code chunk below is blocked on all of them — but live data is.
- **Section 4** is the work, cut into **chunks sized for one Claude ask each**. Every chunk has a ready-to-paste prompt. Chunks say what they depend on; most are independent.
- **Section 5** is the recommended order. **Sections 6–7** are checklists (env vars, per-client status).

Conventions the prompts assume (established in this codebase — keep them):
- Connectors return normalized `Panel[]` (`stat` / `timeseries` / `breakdown`), never touch the UI, and **always fall back to deterministic mock data** on missing credentials or errors.
- Server-only secrets; nothing sensitive reaches the browser.
- Design system: `#ffffff #333333 #e41679 #98d7eb #426fb6`, League Spartan / Fira Sans / Montserrat, square corners, Swiss/Material.
- Tests with Vitest next to the module (`*.test.ts`); typecheck + `pnpm build` must stay green.
- Work on `claude/happy-newton-ya2s7o`; commit with clear messages.

---

## 1. Where the product stands today

### Stack (verified)
| Layer | What | State |
|---|---|---|
| Frontend | Next.js 14.2 App Router, React 18, TS, `@tabler/core` CSS (rebranded, built via `prebuild`), ApexCharts | ✅ deployed on Vercel |
| Routing | Path-based multi-tenant: `site.com/<slug>` via `app/[client]/page.tsx` + zod-validated registry | ✅ |
| URL state | nuqs typed parsers (`range`, `from`, `to`, `compare`) + view tab in URL hash | ✅ |
| Connectors | 34 providers registered in `lib/connectors/index.ts`; p-limit(6) concurrency; mock fallback everywhere | ✅ framework; 3 live-capable today |
| Google auth | One OAuth Web client (`GOOGLE_OAUTH_*`) powers GA4 + Search Console + (with dev token) Google Ads; service-account fallback | ✅ code; env set in Vercel |
| AI / SEO panels | AI Score, AI-referred sessions/pages/assistants (server-side GA4 source filter); SC keyword breakdown + sitemap index health; Bing backlinks + crawl stats | ✅ shipped, on by default |
| Views | Category tabs (Overview / Analytics / Search / Advertising / …), hash-persisted | ✅ |
| Compare & narratives | Prior-period / prior-year compare with dashed overlays; rule-based Smart Narratives | ✅ (but see bugs A1/A2) |
| Reporting | PDF via playwright-core + @sparticuz/chromium, Resend email, Vercel cron Mondays 13:00 UTC (`vercel.json`) | ✅ code; disabled per client, needs `CRON_SECRET`/`RESEND_API_KEY` |
| Semantic layer | boring-semantic-layer + DuckDB FastAPI service (`/semantic`), spec-driven models (`ga4`, `blended`), ingestion + rollups CLIs, Explore UI at `/<slug>/explore` | ✅ running on VM at `http://104.196.217.189:8899`, **demo data only** |
| Tests | 50 Vitest tests green; semantic has pytest + verify scripts | ✅ local only — **no CI for `app/`** |

### Client roster (9, all real GA4 property IDs)
artform 310586485 · bbbnp 302989852 (+ CISR/IRI 499713205) · isea 333478304 · maximus 302350399 · miami-federal 521857796 · moveinterstate 223367126 · sigma-defense 298141839 · winterscale 398292533 · govcon-ideators 395344759

### What's live vs demo, per source type
- **GA4**: live for all 9 once `GOOGLE_OAUTH_*` is in Vercel **and** the consenting account has Viewer on each property.
- **Search Console**: live-capable for artform, bbbnp, isea, maximus, moveinterstate. 4 still on `*.example` placeholders (auto-served as demo by the placeholder guard).
- **Bing Webmaster**: on all 9; demo until `BING_WEBMASTER_API_KEY` + per-site verification.
- **Google Ads / LinkedIn / Mailchimp / HubSpot**: demo — placeholder IDs and/or no tokens.
- **Explore / semantic**: demo Parquet only; no real extracts yet.

---

## 2. Audit findings

### A. Correctness bugs (fix first — these produce **wrong numbers**)

**A1 — Live connectors ignore custom date ranges. (Critical)**
`ConnectorContext` carries `start`/`end`, but `ga4.ts` builds `"{N}daysAgo..today"`, and `searchConsole.ts`/`googleAds.ts` compute their own trailing windows from `ctx.days`. Consequences: a custom range (e.g. "March 1–31") silently fetches the trailing N days instead; and **comparison mode fetches the same trailing window twice**, so live compare deltas collapse to ~0 and the dashed "previous" overlay duplicates the current line. Mock data is unaffected (the orchestrator relabels mock axes), which masked this. This is the single most important fix in the codebase.

**A2 — Compare merge is positional and can misalign. (High)**
`fetchClientData` merges comparison panels by index (`comp.panels[pi]`). Panel lists are now **conditional**: GA4's AI block returns `[]` on error, SC appends sitemap-health panels only when the sitemaps call succeeds, Bing appends SEO panels only when crawl/link endpoints respond. If one window produces a different panel count than the other, every panel after the divergence merges against the wrong partner — wrong compare values on live dashboards. Merge must be keyed (stats by `label`, timeseries/breakdowns by `title`).

**A3 — Provider calls are effectively uncached. (High — quota + latency)**
`export const revalidate = 3600` does nothing here: reading `searchParams` makes the route dynamic, GA4's gRPC client bypasses Next's fetch cache, and SC/Ads/Bing fetches use `cache: "no-store"`. Every page view re-hits every provider API. With 9 clients × ~8 GA4 reports per view, refresh-happy viewers will chew GA4's per-property hourly token quota and make pages slow. Wrap `fetchWindow` in `unstable_cache` keyed by `(slug, window key, sources digest)` with `revalidate: 3600`.

**A4 — Search Console end date ignores data latency. (Medium)**
SC queries end at `yesterday`, but GSC search-analytics data is typically final only ~2–3 days back. The last 1–2 buckets read as zeros, dragging totals down and distorting deltas/narratives. End the window at `today-2` (and label it).

**A5 — Placeholder guards don't cover non-Google connectors. (Medium)**
`linkedin-ads` (accountIds `500000000`–`500000006`), `posthog` (`projectId "00000"`), etc. still carry filler config. The moment someone sets `LINKEDIN_ACCESS_TOKEN`/`POSTHOG_API_KEY`, those sources fire doomed live calls and log 4xx noise (the exact failure mode already fixed for Google/Bing). Guard them or remove filler config.

**A6 — Google Ads API default `v18` is aging out. (Medium, time bomb)**
Ads API versions sunset roughly yearly; `v18` (default in `googleAds.ts`) is near end-of-life. When it sunsets, "live" Ads silently degrades to mock with a cryptic error. Bump the default and document `GOOGLE_ADS_API_VERSION`.

### B. Small QC issues (each trivial, all worth doing)

- **B1** — GA4 fetches `averageSessionDuration` but never renders it; `duration` format already exists in `format.ts`. Add the stat card (or stop fetching it).
- **B2** — "Updated {timestamp}" uses server TZ (UTC on Vercel) with no TZ label; reads as wrong time to US viewers. Show the data window instead, or append the TZ.
- **B3** — GA4's date math uses `new Date()` server-UTC vs. the property's reporting TZ; harmless once A1 lands (document the convention).
- **B4** — BBBNP renders two full "Website Analytics" sections (main + CISR/IRI) including two AI Scores; fine, but the second should suppress or clearly label its AI block to avoid client confusion.
- **B5** — `not-indexed` stat sets `invertDelta` but never has a delta; harmless, but wire deltas for index-health stats when compare is on (depends A2).
- **B6** — `/api/debug/[client]` is **open when `CRON_SECRET` is unset**. It leaks no secrets (only demo/live + error strings), but error strings can include provider messages. Ensure `CRON_SECRET` is set in prod; consider requiring it always in production builds.
- **B7** — Deprecation warnings in logs (`url.parse`, `punycode`) come from Google deps — harmless; pin/ignore, don't chase.
- **B8** — `CONNECTORS.md` client-status table still lists removed clients (CISA, Mocktails, Tanaq, Stanton, Verasole, Minburn) and lacks MoveInterstate/Bing rows.
- **B9** — Report link renders even for clients with `report` unset; PDF works, but email settings/recipients are unconfigured for 8 of 9 clients.
- **B10** — No `robots.txt` / `noindex`: client dashboards are indexable by search engines. They're unlisted-URL public by design — but you almost certainly don't want Googlebot indexing client analytics. Add `noindex` + robots.

### C. Security & ops

- **S1 — Semantic service runs plain HTTP on a public IP with a bearer token.** Token + numbers cross the wire unencrypted, and the token was shared in chat. Put Caddy (auto-TLS) in front or move to Cloud Run; **rotate the token**.
- **S2 — Rotate the Google OAuth client secret** (it appeared in chat/base64 exports) at a convenient moment; refresh tokens will need re-minting after rotation.
- **S3 — Dashboards are public-by-URL** (deliberate MVP choice). Decide: keep, or add a lightweight per-client password / signed-link gate. Easy to add later; noted as a product decision, chunk provided.
- **S4 — No CI**: the repo's `.github/workflows` are upstream Tabler's; nothing typechecks/tests/builds `app/` or `semantic/` on push. One bad merge = broken prod build discovered at deploy time.
- **S5 — No error monitoring/analytics** on the app itself (silent failures only visible in Vercel logs; `console.error` is the entire observability story).
- **S6 — The root landing page publicly enumerates the entire client roster.** `app/app/page.tsx` renders every client's name, slug, and source categories as clickable cards at `/`. Anyone who finds the domain gets a directory of your clients and links to each dashboard — worse than any single unlisted URL leaking. The original architecture called for a dev-only index. Chunk 33.

### D. Product gaps (features you'd want next)

- **D1** — **Conversions & key events (GA4)** — the single most client-persuasive metric; free with existing OAuth. Not yet surfaced.
- **D2** — **Query→page pairing (SC)** — which page ranks for which keyword; SEO's bread and butter; free.
- **D3** — Custom named views per client in the registry (beyond auto category tabs) — e.g. a "CISR/IRI" view for BBBNP's second property.
- **D4** — Client logos (registry supports `brand.logo`; none set).
- **D5** — CSV export per panel (client asks: "can I get the raw numbers?").
- **D6** — Google Sheets connector — the designed-but-unbuilt universal token-free ingestion path (organic social, offline data, anything).
- **D7** — Google Business Profile connector (maps views/calls/directions) on the same OAuth (extra scope).
- **D8** — AI Score history: it's point-in-time; persisting it makes it a trendline (needs the lake, D-backend).
- **D9** — Per-panel "what is this?" info tooltips (esp. AI Score methodology) for client trust.
- **D10** — Search appearance breakdown (SC `searchAppearance` dimension: rich results, FAQ, video).

### E. Data-backend gaps (semantic layer / history)

- **E1** — **No real extracts**: the lake holds only demo Parquet. Everything in Explore/blended is sample data. A GA4→Parquet extractor (Python, same OAuth refresh token) is the unlock for all of E2–E5.
- **E2** — Blended metrics (CAC/ROAS/CTR) are proven on sample data; wiring them live needs Ads/Meta spend extracts joined to GA4 conversions.
- **E3** — History beyond GA4's API window: daily→monthly rollups exist (`rollups.py`) but nothing schedules them; no cron on the VM.
- **E4** — NLQ ("ask your dashboard") — designed, not built. Needs a `/nlq` endpoint that has Claude translate a question into a semantic-layer query against `/models` schemas, execute it, and return panels. All server-side, stays branded (Path A).
- **E5** — Explore is not client-scoped server-side: the shared bearer token can query any client's rows; the UI filters by `client` but the API doesn't enforce it. Fine while data is fake; must be enforced before real data lands (derive allowed `client` from the requesting page, inject the filter in the Next proxy).

### F. UX audit (second pass — every claim verified in code)

The first pass was correctness/data-heavy; this is the experience pass. Ordered by how much a client would notice.

- **F1 — Client-facing copy leaks dev internals. (Fix first — it's a trust leak.)** The demo-data banner says *"See `app/README.md` to connect live data"* (`app/[client]/page.tsx`) and the empty-view state says *"Add sources to this client in `config/clients.ts`"* (`DashboardBody.tsx`). Clients viewing their own dashboard are reading your repo instructions. All viewer-visible copy must be client-appropriate ("Sample data shown while this source is being connected").
- **F2 — Fonts load from the Google Fonts CDN** via `<link>` in `layout.tsx` instead of `next/font` self-hosting: flash-of-unstyled-text on first paint, a third-party request on every client dashboard, and the PDF renderer depends on the CDN being reachable. Also: no favicon, no OG/social metadata (a shared dashboard link unfurls as nothing).
- **F3 — Comparison overlay colors don't pair.** Dashed "(prev)" series are appended to the series list, so they take the *next* palette slots: "Users" renders brand-blue but "Users (prev)" renders sky; "Sessions" pink but "Sessions (prev)" ink. Visually nothing says which dashed line belongs to which solid line. Prev-series should reuse their primary's color (muted/dashed).
- **F4 — Donut palette runs out.** `palette()` yields 4 colors; GA4's sources donut has 6 slices — ApexCharts cycles, so two pairs of slices share colors. Need 6–8 distinct brand-derived shades (contrast-checked).
- **F5 — Charts are invisible to assistive tech and ignore reduced-motion.** No aria summaries on chart cards; `prefers-reduced-motion` exists in CSS but ApexCharts animates via JS and ignores it (`matchMedia` must set `chart.animations.enabled: false`).
- **F6 — Explore speaks in raw schema.** Model dropdown shows `ga4`/`blended`; group-by chips show `sessionDefaultChannelGroup`, `totalUsers`. No sort or row-limit control; filter chips hardcode white text on `brand.primary` (should use `readableTextColor`); table shows only "Loading…" in the chart header while refreshing; no Escape-to-close anywhere.
- **F7 — Range presets miss the agency staples.** Only 7d/28d/90d/custom — no "This month" / "Last month", which is how agencies actually report. Day-picker popover: no Escape-close, and react-day-picker's default stylesheet is rounded (off design system).
- **F8 — (= S6)** Landing page exposes the roster — see §2C.
- **F9 — View tabs lack keyboard arrow navigation** (`role="tablist"` without arrow-key handling). Buttons are tabbable, so it's usable — just not to spec.
- **F10 — New KPIs fall back to a generic icon** (`Icons.tsx` maps by label; AI Score, AI-referred sessions, Backlinks, Index coverage, Crawl errors aren't mapped), and Smart Narratives ignore the AI/SEO panels entirely — the newest features never make the summary card.
- **F11 — Loading skeleton mirrors only stat tiles** (8 placeholder cards, no chart/table blocks) — a jarring swap on slow loads.
- **F12 — During a range/compare change only the controls dim**; the stale dashboard body shows no refresh cue. A subtle top progress bar (or dimming the body region) would signal "recalculating."
- **F13 — Horizontal bar charts with long labels** (page paths, campaign names) crowd/truncate at Apex defaults; needs a label formatter + full value in tooltip.
- **F14 — Mobile is unverified.** `globals.css` has essentially one breakpoint's worth of responsive rules; the sticky controls row (4 preset buttons + compare select + Explore + PDF) likely wraps awkwardly under ~400px. Needs a real device-width pass with screenshots, not guesses.

---

## 3. Inputs only a human can provide

| # | Input | Unblocks | Where |
|---|---|---|---|
| H1 | **Bing Webmaster API key** + sites verified (use "Import from GSC") | Backlinks + crawl panels live, all 9 clients | bing.com/webmasters → Settings → API access → generate; put in Vercel as `BING_WEBMASTER_API_KEY` |
| H2 | **4 Search Console site URLs**: miami-federal, sigma-defense, winterscale, govcon-ideators (+ confirm OAuth account has SC access on all 9) | SC live for those 4 | send URLs; I patch `config/clients.ts` |
| H3 | **Google Ads developer token** (+ MCC login-customer-id, + per-client 10-digit customer IDs) | Ads live | Ads → Tools → API Center; `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` |
| H4 | **`CRON_SECRET`** set in Vercel | Debug route gated; report cron authenticated | any random string |
| H5 | **`RESEND_API_KEY` + `REPORT_FROM`** + per-client recipients + which clients get scheduled reports | Email reports | resend.com; recipients → registry |
| H6 | Mailchimp API key; HubSpot private-app token; LinkedIn decision (skip API → Sheets path?) | those sources live / removed | env vars |
| H7 | Client logo files/URLs (optional) | branded headers | registry `brand.logo` |
| H8 | Decision **S3**: keep dashboards public-by-URL or gate them? | chunk 22 | — |
| H9 | Rotate semantic token + OAuth client secret when convenient (S1/S2) | hygiene | VM env + Google console |
| H10 | VM access (or a say-so) to install Caddy for TLS on the semantic service | S1 | — |

---

## 4. Work chunks (each = one Claude ask)

> Copy the **Prompt** block verbatim into a new ask. Chunks note dependencies; unmarked chunks are independent. "Done when" = acceptance criteria.

### Phase 0 — Correctness (do these before anything else)

---

**Chunk 1 — Honor custom date ranges in all live Google connectors** _(fixes A1; biggest correctness win)_

*Why:* Custom ranges and comparison windows currently fetch the wrong dates on live data; live compare deltas are ~0.
*Files:* `app/lib/connectors/ga4.ts`, `searchConsole.ts`, `googleAds.ts`, `bingWebmaster.ts`, `types.ts` (docs), tests.
*Done when:* every live fetch uses `ctx.start`/`ctx.end` when present (GA4 `dateRanges` with explicit dates; SC `startDate/endDate`; Ads GAQL `BETWEEN`); the "previous period" used for each connector's own delta is derived from the same explicit window; trailing-days strings remain only as fallback when `start`/`end` are absent; unit tests cover the date-window computation (pure helpers extracted so they're testable without API calls); full suite + build green.

*Prompt:*
```
In app/lib/connectors, live fetches ignore ConnectorContext.start/end: ga4.ts uses "{N}daysAgo..today", searchConsole.ts and googleAds.ts compute their own trailing windows from ctx.days. This makes custom ranges and comparison windows fetch wrong dates on live data (compare fetches the same trailing window twice). Fix all live connectors (ga4, searchConsole, googleAds, bingWebmaster where its API allows) to use ctx.start/ctx.end when present, falling back to the current trailing-window behavior only when they're absent. Each connector's internal "previous period" (used for its own delta) must be derived from the explicit window (same length, immediately preceding). Extract the window/prev-window date math into a small pure helper (lib/connectors/dates.ts) with Vitest tests. Keep Search Console's end date clamped to no later than today-2 (GSC data latency). Don't change panel shapes. Typecheck, run the full vitest suite, build, commit, push.
```

---

**Chunk 2 — Key-based compare merge** _(fixes A2; depends conceptually on nothing, pairs well after Chunk 1)_

*Why:* Positional merge misaligns when conditional panels (AI block, sitemap health, Bing SEO) differ between windows.
*Files:* `app/lib/connectors/index.ts` (+ test file).
*Done when:* stats merge by `label`, timeseries/breakdowns by `title`, unmatched panels pass through unmerged; a test proves a primary with AI panels + a comparison without them still merges every core stat correctly.

*Prompt:*
```
In app/lib/connectors/index.ts, fetchClientData merges comparison panels positionally (comp.panels[pi]). Panel lists are conditional now (GA4 AI block can be [], Search Console sitemap-health and Bing SEO panels are appended only on success), so positional merge can pair the wrong panels and produce wrong compareValues. Rewrite mergePanel usage to key-based matching: stats matched by label, timeseries and breakdowns by title, within the same source result; unmatched panels pass through unchanged. Add a Vitest test (lib/connectors/merge.test.ts) with a primary result containing extra AI panels and a comparison missing them, asserting every shared stat gets the right compareValue and unmatched panels are untouched. Keep the dashed "(prev)" overlay behavior for matched timeseries. Typecheck, full suite, build, commit, push.
```

---

**Chunk 3 — Cache provider fetches (quota + latency)** _(fixes A3)_

*Why:* Every page view currently re-hits every provider API; GA4 quota burn and slow pages.
*Files:* `app/lib/connectors/index.ts`, possibly `app/app/[client]/page.tsx`.
*Done when:* `fetchWindow` results are served from `unstable_cache` (key: client slug + window key + a digest of source configs; `revalidate: 3600`, tagged per client); debug route bypasses the cache; repeated loads of the same range don't re-hit providers (verify via log counters in dev); documented in code comments.

*Prompt:*
```
The dashboard route reads searchParams (dynamic rendering), GA4 uses gRPC, and SC/Ads/Bing fetches use cache:"no-store" — so every page view re-hits every provider API despite revalidate=3600. In app/lib/connectors/index.ts, wrap the per-window fetch (fetchWindow) in Next's unstable_cache keyed by (client slug, window key/start/end, a stable JSON digest of client.sources) with revalidate: 3600 and a per-client tag like `client:${slug}`. Keep /api/debug/[client] uncached (it must show real state — call the uncached path directly). Make sure mock relabeling still happens outside or deterministically inside the cache so cached mock data stays date-correct for the window. Add a brief comment explaining why revalidate-on-page doesn't work here. Typecheck, tests, build, commit, push.
```

---

**Chunk 4 — Placeholder guards for the remaining connectors** _(fixes A5)_

*Prompt:*
```
app/lib/connectors/placeholder.ts guards GA4/Search Console/Google Ads/Bing from placeholder config, but other configured sources still carry filler values: linkedin-ads accountIds 500000000–500000006 and posthog projectId "00000" in app/config/clients.ts. Extend the guard pattern: in linkedinAds.ts and posthog.ts (and any other connector whose registry config is clearly filler — audit config/clients.ts), serve mock directly when the config value is a placeholder (reuse isPlaceholderId / add a tiny isPlaceholderAccountId helper for the 5000000xx pattern with tests). Alternatively, where a config value is pure invention with no real counterpart planned, note it as such in a comment. Do not remove sources from the registry. Typecheck, tests, build, commit, push.
```

---

**Chunk 5 — Bump Google Ads API version + robustness** _(fixes A6)_

*Prompt:*
```
app/lib/connectors/googleAds.ts defaults GOOGLE_ADS_API_VERSION to "v18", which is near sunset (Ads API versions retire ~yearly). Check the currently supported Google Ads REST API versions (developers.google.com/google-ads/api) and bump the default to the newest stable version, updating the GAQL if any referenced field changed. On a 4xx that indicates a retired version, log a clear actionable error ("set GOOGLE_ADS_API_VERSION=vNN"). Update .env.example's comment. Typecheck, tests, build, commit, push.
```

---

### Phase 1 — QC polish (small, fast, high-trust)

---

**Chunk 6 — QC sweep: avg session duration, Updated-timestamp, index-health deltas, BBBNP AI dedupe** _(B1, B2, B5, B4)_

*Prompt:*
```
Four small QC fixes in the ArtForm dashboards app:
1) app/lib/connectors/ga4.ts fetches averageSessionDuration but never renders it — add an "Avg. session duration" stat panel using the existing "duration" format (with delta vs previous period like the other stats).
2) app/app/[client]/page.tsx footer shows "Updated {new Date().toLocaleString()}" in server TZ with no label — replace with the data window text plus an explicit UTC-labeled updated time (e.g. "Updated Jul 18, 14:05 UTC").
3) Index-health stats in searchConsole.ts set invertDelta but never receive deltas; ensure they participate in compare merging (they will once merging is key-based) and drop invertDelta where a delta can never exist.
4) config/clients.ts gives BBBNP a second ga4 source labeled "BBBNP CISR/IRI" — its section currently repeats the full AI block. Add an optional per-source config flag (e.g. config.aiInsights: false) that the GA4 connector respects to skip AI panels for secondary properties, and set it on the CISR/IRI source.
Keep mock parity where relevant. Typecheck, run the suite, build, commit, push.
```

---

**Chunk 7 — noindex + robots + security headers** _(B10, part of S3 hygiene)_

*Prompt:*
```
Client dashboards at /<slug> are public-by-URL by design but must not be search-indexable. In the Next app (app/): add metadata robots noindex,nofollow on client dashboard + explore pages, an app/robots.ts disallowing all crawling, and (in next.config.mjs headers()) X-Robots-Tag: noindex plus sensible security headers (X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, X-Frame-Options SAMEORIGIN). Don't break the PDF renderer (it loads pages with ?print=1 via headless Chromium — same origin, unaffected by robots). Typecheck, build, commit, push.
```

---

**Chunk 8 — CONNECTORS.md refresh + client-status table** _(B8)_

*Prompt:*
```
app/CONNECTORS.md's "Client connection status" section is stale: it still lists removed clients (CISA, Mocktails, Tanaq, Stanton, Verasole/Calibre, Minburn Tech) and predates MoveInterstate, the BBBNP CISR/IRI second property, and the bing-webmaster source added to all 9 clients. Rebuild the status table from the current app/config/clients.ts (9 clients), with one row per client×source showing live-capable vs placeholder config and what's still needed (e.g. 4 clients missing real Search Console URLs; all google-ads customerIds are placeholders; Bing needs BING_WEBMASTER_API_KEY + site verification). Keep the rest of the doc intact; update the "Keeping this doc updated" reminders if needed. Commit, push.
```

---

**Chunk 9 — Panel info tooltips (AI Score methodology first)** _(D9)_

*Prompt:*
```
Add an optional `info?: string` field to Panel types (stat + breakdown + timeseries) in app/lib/connectors/types.ts, rendered in PanelSection.tsx/StatCard.tsx as a small ⓘ icon (Tabler icon) with a title-attribute/tooltip (no new dependency; CSS-only or title= is fine, keep square-corner design). Populate it where it earns trust: AI Score ("Composite of AI traffic share (35%), momentum (20%), engagement quality (15%), assistant diversity (15%), page coverage (15%); see CONNECTORS.md"), Index coverage, Backlinks (source: Bing), Engagement rate. Keep contrast AA on the icon. Typecheck, tests, build, commit, push.
```

---

**Chunk 10 — Empty/error states for AI + SEO panels**

*Why:* When live AI queries return zero AI sessions the score reads 0/D with no context; when sitemaps aren't configured the health block vanishes silently.
*Prompt:*
```
Polish edge states in the AI/SEO panels. 1) In ga4.ts fetchAiInsights, when aiSessions === 0 return the AI Score stat with caption "No AI-referred traffic detected this period" (score computes as-is) and skip the empty pages/assistants breakdowns. 2) In searchConsole.ts, when the sitemaps list is empty (site verified but no sitemaps submitted), emit a single stat panel "Sitemaps" value 0 with caption "No sitemaps submitted in Search Console" instead of nothing. 3) In bingWebmaster.ts, when links/crawl endpoints return ok-but-empty, keep the Backlinks stat (0) with caption "Site not yet verified in Bing Webmaster?" only when total===0 AND crawl also null; otherwise render numbers as-is. Adjust mocks so demo mode still shows the rich versions. Update seoHealth tests accordingly. Typecheck, suite, build, commit, push.
```

---

### Phase 2 — Turn on live data (small code + human inputs from §3)

---

**Chunk 11 — Wire the 4 remaining Search Console URLs** _(needs H2)_

*Prompt:*
```
Update app/config/clients.ts: replace the *.example search-console and bing-webmaster siteUrls for miami-federal, sigma-defense, winterscale, and govcon-ideators with these real URLs: [PASTE URLS HERE]. Match the exact form the Search Console property uses (URL-prefix "https://.../" with trailing slash, or "sc-domain:example.com" for domain properties — the placeholder guard and SC API both accept either). Typecheck (zod validates), run the suite, commit, push. Then list which /api/debug/<slug> checks I should run to confirm each goes live.
```

---

**Chunk 12 — Google Ads live wiring** _(needs H3)_

*Prompt:*
```
Google Ads credentials are ready: developer token + login-customer-id are in Vercel env (GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID; OAuth reuses GOOGLE_OAUTH_*). Update app/config/clients.ts with these real customer IDs: [CLIENT → 123-456-7890 pairs]. Confirm the refresh token was minted with the adwords scope (https://www.googleapis.com/auth/adwords) — if googleAuth's token flow needs a scope note, update .env.example and CONNECTORS.md accordingly. Verify googleAds.ts hasAdsCredentials + placeholder guard behave, run the suite, build, commit, push, and tell me the debug-route checks to run.
```

---

**Chunk 13 — Report enablement per client** _(needs H4/H5)_

*Prompt:*
```
Scheduled PDF/email reports exist (app/lib/report/*, /api/cron/reports, vercel.json cron Mondays 13:00 UTC) but only artform has recipients and every client is enabled:false. Update app/config/clients.ts report blocks with these recipients and enabled flags: [CLIENT → emails]. Then audit the cron route end-to-end for the enabled clients: confirm CRON_SECRET gating, Resend from-address (REPORT_FROM), and that the PDF route renders with ?print=1 showing all sources. Add a dry-run mode to /api/cron/reports (?dry=1 lists what would send without sending). Update REPORTS.md. Typecheck, suite, build, commit, push.
```

---

### Phase 3 — Product features

---

**Chunk 14 — GA4 conversions & key events panels** _(top client value; do soon after Phase 0)_

*Prompt:*
```
Add conversion tracking to the GA4 connector (app/lib/connectors/ga4.ts) as default panels: a "Conversions" stat (GA4 metric keyEvents, with delta vs previous period), a "Sessions → conversion rate" stat (sessionKeyEventRate or computed keyEvents/sessions), a "Conversions over time" line on the existing traffic timeseries or its own small timeseries, and a "Top converting events" breakdown (dimension eventName filtered to key events, metric keyEvents, top 8). Use explicit date windows per the ctx.start/end convention. If a property has zero key events configured, show the Conversions stat as 0 with caption "No key events configured in GA4". Extend the mock path with plausible conversion data (deterministic via rng). Isolate like the AI block so failures never drop core panels. Tests for any pure helpers + update ga4 mock test. Typecheck, suite, build, commit, push.
```

---

**Chunk 15 — Search Console query→page pairing** _(D2)_

*Prompt:*
```
In app/lib/connectors/searchConsole.ts add a default "Keywords by page" breakdown: query the Search Analytics API with dimensions ["query","page"] (rowLimit 250), aggregate to the top 10 query+page pairs by clicks, rendering label = query, sublabel = "page-path · Pos X.X · N impr", value = clicks. Trim page URLs to path-only for display. Respect the explicit date window and the today-2 latency clamp. Mock parity: extend fetchMock with plausible pairs. Update the seoHealth test to assert the new panel exists. Typecheck, suite, build, commit, push.
```

---

**Chunk 16 — Custom named views in the registry** _(D3; gives BBBNP CISR/IRI its own tab)_

*Prompt:*
```
Dashboard views are currently auto-generated category tabs (app/components/DashboardBody.tsx). Add optional custom views to the client registry: in app/config/clients.ts schema, an optional `views?: { name: string; sourceIds?: string[]; types?: string[] }[]` (zod-validated; name required, at least one selector). Sources get stable ids today via `${result.sourceId}-${i}` in lib/connectors/index.ts — also allow the registry source to declare an explicit `id` used instead of the index suffix so views can reference it durably. When client.views is present, render those as tabs after Overview (before category tabs; keep categories too), filtering results accordingly; hash-persistence must keep working. Define a "CISR/IRI" view for bbbnp showing only the second GA4 source (give it id "ga4-cisr"). Tests for the pure view-filtering helper. Typecheck, suite, build, commit, push.
```

---

**Chunk 17 — CSV export per panel** _(D5)_

*Prompt:*
```
Add CSV export to dashboard panels. Server route /api/export/[client]?panel=… is overkill — do it client-side: in PanelSection.tsx add a small "CSV" ghost-button on breakdown tables and timeseries cards that serializes the panel's rows/points to CSV and triggers a download named "<client-or-source>-<panel-title>-<window>.csv" (pass windowLabel down as a prop). No new dependency (hand-roll CSV escaping; tests for the escaper in lib/csv.test.ts). Keep the button out of print mode (d-print-none) and off stat cards. Match design system. Typecheck, suite, build, commit, push.
```

---

**Chunk 18 — Google Sheets connector (universal token-free ingestion)** _(D6; design already in CONNECTORS.md)_

*Prompt:*
```
Build the gsheets connector designed in app/CONNECTORS.md: type "gsheets", config { spreadsheetId: string; tab?: string; range?: string; label?: string }, reading via the existing Google OAuth/service-account access token with scope https://www.googleapis.com/auth/spreadsheets.readonly added to the googleAuth scope handling (values.get on "Tab!A:Z"). Expected sheet shape, documented in the connector header: row 1 = column headers; a "date" column (YYYY-MM-DD) makes numeric columns timeseries; without one, rows render as a breakdown table (first col label, second col value). First numeric column also becomes a total stat. Cap at 1000 rows. Mock fallback with a deterministic sample sheet. Register in lib/connectors/index.ts, add .env note (no new env — reuses Google auth; the consenting account must have view access to the sheet), CONNECTORS.md catalog row + flip the "proposed" note to built, Vitest tests for the pure sheet→panels transform. Typecheck, suite, build, commit, push.
```

---

**Chunk 19 — YouTube + logos quick wins** _(D4, existing connector)_

*Prompt:*
```
Two small registry wins: 1) Add client logos: app/config/clients.ts brand.logo accepts a URL — wire these: [CLIENT → logo URL pairs, or "skip if I haven't provided them"]. Constrain header <img> height styling if a logo is very wide (max-width via CSS, keep height 30). 2) For clients with YouTube channels [CLIENT → channelId pairs], add youtube sources (connector exists; needs YOUTUBE_API_KEY env — note in CONNECTORS.md status table). Typecheck, suite, build, commit, push.
```

---

### Phase 4 — Data backend (semantic layer becomes real)

---

**Chunk 20 — GA4→Parquet extractor (the unlock)** _(E1; everything in this phase depends on it)_

*Prompt:*
```
In /semantic, build the first real extractor: extract_ga4.py, a CLI that pulls daily GA4 metrics per client into the Parquet lake using the same Google OAuth refresh-token flow the Next app uses (env GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN; exchange for an access token, call the GA4 Data API REST runReport directly — no heavy SDK). Source of truth for clients/properties: read app/config/clients.ts is TS — instead add semantic/clients.yaml (slug → ga4 property id for the 9 real clients, generated once, documented as needing sync with config/clients.ts). Pull per client per day: sessions, totalUsers, screenPageViews, keyEvents, engagementRate + dimension sessionDefaultChannelGroup, into the existing ingest.py idempotent path (client column, date column, daily grain) as source "ga4". Support --since/--until/--client flags, default backfill 365 days, respect GA4 quotas (sleep between properties, retry 429 with backoff). Update specs/ga4.yaml if column names need aligning, INGESTION.md with a runbook (initial backfill + daily incremental command), and verify with a small script asserting row counts > 0 per client. Do not commit any real data or secrets (lake dir already gitignored).
```

---

**Chunk 21 — Schedule extraction + rollups on the VM (or GitHub Actions)** _(needs Chunk 20 + H9/H10 access)_

*Prompt:*
```
The semantic service VM (the box running /semantic's FastAPI app) needs a daily pipeline: run extract_ga4.py --incremental for all clients, then rollups.py, then a health assertion (row count grew; latest date == yesterday), logging to a file with failures surfaced clearly. Write semantic/pipeline.sh + a systemd timer unit (or cron line) with install instructions in INGESTION.md; make the script safe to re-run (extraction is idempotent). Include a manual backfill section. If VM access isn't available from this session, deliver the files + exact install commands for me to run. Commit, push.
```

---

**Chunk 22 — Server-side client scoping for Explore/semantic** _(E5; must land before real data is served)_

*Prompt:*
```
Before real client data lands in the semantic lake, enforce client scoping server-side. In the Next app: /api/semantic (app/app/api/semantic/route.ts) currently forwards arbitrary queries with the shared bearer token. Change the contract: the route derives the allowed client slug from an explicit `client` field the Explore page sends, validates it against config/clients.ts, and force-injects/overwrites a filter { field: "client", op: "=", value: slug } into every query before forwarding (models without a client dimension: reject with 400 unless the model is in an allowlist of shared models). Update components/Explore.tsx + lib/explore.ts to always pass the page's client slug and never expose the filter as user-editable. Add tests for the injection logic (pure helper). Document in CONNECTORS.md semantic section. Typecheck, suite, build, commit, push.
```

---

**Chunk 23 — TLS for the semantic service + token rotation** _(S1; config/instructions chunk)_

*Prompt:*
```
The semantic FastAPI service listens on plain HTTP at a public IP with bearer auth. Produce the hardening kit in /semantic: (1) a Caddyfile reverse-proxying a domain (e.g. semantic.artformagency.com) → localhost:8899 with automatic HTTPS, plus install/systemd instructions in README.md; (2) app.py: add optional SEMANTIC_BIND_HOST (default 127.0.0.1 when behind the proxy) and a startup warning when serving non-localhost without a proxy; (3) a TOKEN ROTATION section in README: generate a new SEMANTIC_API_TOKEN, update VM env + Vercel env, zero-downtime order of operations; (4) optional IP allowlist note (Vercel egress isn't fixed — rely on TLS+token). Update app/.env.example comment to say the URL should be https. Commit, push. Give me the DNS record + commands to run on the VM.
```

---

**Chunk 24 — Blended metrics on real data** _(needs Chunks 20/21 + Ads live (Chunk 12))_

*Prompt:*
```
Extend the semantic extraction to ad spend so blended metrics go live: add extract_google_ads.py to /semantic (REST searchStream, same OAuth + GOOGLE_ADS_DEVELOPER_TOKEN env, per-client customer IDs in clients.yaml) pulling daily cost/clicks/impressions/conversions per client into source "ad_spend" (align columns with specs/blended.yaml; adjust the spec/build_blended.py if names differ). Wire build_blended.py into pipeline.sh after extraction. Verify CAC/ROAS/CTR compute on real rows via verify_blended.py. Update INGESTION.md. No secrets/data committed.
```

---

**Chunk 25 — AI Score history + trendline** _(D8/E3; needs Chunk 20 pattern)_

*Prompt:*
```
Make the AI Score a trendline. Semantic side: extend extract_ga4.py to also compute and store a daily ai_traffic table per client (ai_sessions, total_sessions, ai_engaged, distinct_ai_sources, distinct_ai_pages — reuse the token list from app/lib/connectors/aiSources.ts by duplicating the tokens into semantic/ai_tokens.py with a sync comment) and a specs/ai.yaml model. App side: on the dashboard, when the semantic service is configured and the ai model has rows for this client, add an "AI Score trend" timeseries panel to the GA4 section (server-side query via lib/semantic.ts, computing the score per week from the stored signals using the exact computeAiScore weights; graceful skip when semantic is absent). Tests for the weekly-score computation. Typecheck, suite, build, commit, push.
```

---

**Chunk 26 — NLQ: "ask your dashboard"** _(E4; needs Chunk 22 scoping; semantic service reachable)_

*Prompt:*
```
Build NLQ for the Explore page, fully branded/no viewer tokens (Path A). Server: new route app/app/api/nlq/route.ts (POST { client, question }) that (1) loads the semantic /models schemas, (2) calls Claude (Anthropic SDK, env ANTHROPIC_API_KEY, model claude-sonnet-5) with a system prompt embedding the schemas and strict instructions to return ONLY a JSON semantic query {model, dimensions, measures, filters, time_range, order_by, limit}, (3) validates the JSON with zod against the schema (reject unknown fields/models), (4) forces the client filter exactly like /api/semantic does, (5) executes via runSemanticQuery and returns { query, result, explanation }. UI: add a question input at the top of components/Explore.tsx ("Ask: e.g. 'sessions by channel last 90 days'") that fills the explore controls from the returned query and renders the result through the existing table/chart, showing the generated query for transparency. Degrade gracefully when ANTHROPIC_API_KEY or the semantic service is absent (input hidden). Never expose the Anthropic key client-side. Tests for the zod validation + filter forcing. Update CONNECTORS.md + .env.example. Typecheck, suite, build, commit, push.
```

---

### Phase 5 — Ops, CI, trust

---

**Chunk 27 — CI for app + semantic** _(S4)_

*Prompt:*
```
Add CI. Create .github/workflows/app-ci.yml: on push/PR touching app/** or pnpm-lock: pnpm install (with pnpm/action-setup, node 20, pnpm cache), build @tabler/core css (the app's prebuild), tsc --noEmit, vitest run, next build for app/. Create .github/workflows/semantic-ci.yml: on paths semantic/**: python 3.11, pip install -r semantic/requirements.txt, run its pytest suite (skip tests needing live creds via markers if present). Don't touch the existing upstream Tabler workflows. Keep runtimes tight (cache pnpm + pip). Commit, push, and confirm both workflows pass on this branch.
```

---

**Chunk 28 — Optional access gate for dashboards** _(S3; only if H8 = "gate them")_

*Prompt:*
```
Add a lightweight optional access gate to client dashboards. Registry: optional `access?: { password: string }` per client in config/clients.ts — but the password value itself must live in env, so make it `access?: { envVar: string }` naming an env var holding that client's passphrase. Middleware or layout-level check on /<slug> and /<slug>/explore: no cookie → minimal branded password form (square corners, League Spartan title); correct passphrase → set an HttpOnly signed cookie (HMAC with CRON_SECRET as key, 30-day expiry) scoped to the slug. PDF renderer and cron must keep working: allow a ?token=<CRON_SECRET> bypass identical to the report routes. Clients without `access` stay public. Tests for the HMAC sign/verify helper. Update DEPLOY.md. Typecheck, suite, build, commit, push.
```

---

**Chunk 29 — Client onboarding runbook** _(docs; cements everything above)_

*Prompt:*
```
Write app/ONBOARDING.md: the exact recipe to add a new client end-to-end, derived from the current code. Sections: 1) registry entry (slug rules, brand colors contrast note, sources cheatsheet with real config examples per connector type incl. gsheets if built); 2) Google-side grants (add the OAuth consenting account as Viewer on GA4 property + SC site; sc-domain vs URL-prefix); 3) Bing (import from GSC, one API key covers all); 4) env vars that must already exist vs per-client values; 5) semantic/clients.yaml sync + backfill command (if extractor built); 6) verification: /api/debug/<slug> reading, what "demo" vs "live" means per source; 7) reports opt-in. Keep it under two pages, checklist style. Link from README.md and CONNECTORS.md. Commit, push.
```

---

### Phase 6 — UX & experience polish (second pass)

---

**Chunk 30 — Client-safe copy sweep** _(F1; smallest chunk in the plan, do it immediately)_

*Prompt:*
```
Viewer-visible copy in the dashboards leaks dev internals. In app/app/[client]/page.tsx the demo-data banner says "See app/README.md to connect live data" and in app/components/DashboardBody.tsx the empty-view state says "Add sources to this client in config/clients.ts". Sweep ALL viewer-visible strings (dashboard page, DashboardBody, PanelSection "Live fetch unavailable" line, Explore error/empty states, not-found page) and make them client-appropriate — e.g. "Sample data shown while this source is being connected." No file paths, no repo references, no jargon. Keep the orange "demo data" badge. Dev hints may move into HTML comments or show only when the URL has ?internal=1. Typecheck, suite, build, commit, push.
```

---

**Chunk 31 — Self-hosted fonts + favicon + OG metadata** _(F2)_

*Prompt:*
```
app/app/layout.tsx loads League Spartan/Fira Sans/Montserrat from the Google Fonts CDN via <link>. Migrate to next/font/google (self-hosted, no runtime third-party request): League Spartan weight 900, Fira Sans 400/500/700, Montserrat 400/500/600/700, exposing CSS variables consumed where the compiled Tabler CSS / globals.css reference the family names (add font-family fallbacks via the variables — check core/scss + app/app/globals.css for hardcoded family names and align without rebuilding core if possible; overriding via globals.css :root is acceptable). Also add: a favicon (simple square "A" mark in ArtForm ink/pink, as app/app/icon.svg), per-client OpenGraph/Twitter metadata in [client]/page.tsx generateMetadata (title, description "Performance dashboard · ArtForm", no client data in the OG image — text-free brand image or none). Verify the PDF renderer still renders with correct fonts (they're now bundled). Typecheck, suite, build, commit, push.
```

---

**Chunk 32 — Chart color science + chart a11y** _(F3, F4, F5, F13; land after Chunk 2)_

*Prompt:*
```
Four chart fixes in app/components/Charts.tsx (+ PanelSection where noted):
1) Comparison pairing: TimeseriesChart currently appends "(prev)" dashed series which take the NEXT palette colors, so prev lines don't visually pair with their primary. Assign each dashed series the same color as its primary series (match by name prefix before " (prev)"), keeping dash + reduced opacity as the differentiator.
2) Donut palette: palette() has 4 colors but donuts get up to 6 slices (colors repeat). Extend to 8 distinct brand-derived colors (derive tints/shades of #426fb6 #e41679 #98d7eb #333333; ensure adjacent slices are distinguishable and legend text stays AA on white).
3) Reduced motion: respect prefers-reduced-motion by disabling Apex animations (window.matchMedia in a client hook; charts get animations: { enabled: false } when reduced).
4) Long horizontal-bar labels: clamp category labels to ~28 chars with an ellipsis via yaxis/xaxis label formatter, showing the full label in the tooltip.
Also add an aria-label to each chart card container in PanelSection summarizing the panel (title + series names + point count). Add/extend a small unit test for the pure color-derivation helper. Typecheck, suite, build, commit, push.
```

---

**Chunk 33 — Landing-page privacy mode** _(F8/S6)_

*Prompt:*
```
The root page (app/app/page.tsx) publicly lists every client with links — a directory of the agency's roster. Make it private by default: introduce env LANDING_INDEX (unset/false = render a minimal branded splash: dark header, "ArtForm Dashboards", "Powered by ArtForm", no client list, noindex; true = current index for internal use). Alternatively also allow ?token=<CRON_SECRET> to view the full index on demand when LANDING_INDEX is false. Keep the design system. Update DEPLOY.md (set LANDING_INDEX=true only on preview/internal deployments). Typecheck, suite, build, commit, push.
```

---

**Chunk 34 — Mobile/responsive verification pass (with screenshots)** _(F14, F11, F12)_

*Prompt:*
```
Do a real responsive pass on the dashboards app. Run the dev server and use Playwright (chromium at /opt/pw-browsers, PLAYWRIGHT_BROWSERS_PATH set) to screenshot /artform (Overview + a category tab + compare on + custom-range picker open) at 360, 768, 1280 widths. Fix what the screenshots show is broken, expected suspects: the sticky controls row wrapping awkwardly (4 preset buttons + compare select + Explore + PDF at 360px), view-tab overflow (make them horizontally scrollable with no wrap on mobile), day-picker popover overflowing the viewport (single month on small screens via numberOfMonths responsive), stat-grid min column width, table overflow. Also: extend [client]/loading.tsx skeleton to include a chart-shaped block and a table block so the swap is less jarring, and add a 2px brand-primary top progress bar during range/compare transitions (the controls already expose isPending — lift or duplicate that signal). Re-screenshot after fixes and send me before/after. Typecheck, suite, build, commit, push.
```

---

**Chunk 35 — Explore usability** _(F6; independent)_

*Prompt:*
```
Make Explore friendlier (app/components/Explore.tsx + lib/explore.ts):
1) Friendly labels: add a display-name map (lib/semanticLabels.ts) for models (ga4 → "Website analytics", blended → "Cross-source") and fields (totalUsers → "Users", sessionDefaultChannelGroup → "Channel", session_date → "Date", cost/cac/roas → proper case) with fallback = prettified raw name (camelCase/snake_case → spaced Title Case). Use everywhere labels render (chips, dropdown, table headers, chart series names) while queries keep raw names.
2) Filter chips: use readableTextColor(brand.primary) instead of hardcoded #fff.
3) Sort + limit: a compact "Sort by <measure> ↓ · Top 20/50/100" control pair wired into buildExploreQuery's order_by/limit, URL-persisted via the existing parsers.
4) Loading: dim the results table (opacity .5) while loading instead of only the header text.
5) Escape key closes nothing today — add key handling so Escape clears focus/no-ops gracefully (and closes the day-picker popover if this component ever hosts one).
Update lib/explore tests for the sort/limit query building and the label prettifier. Typecheck, suite, build, commit, push.
```

---

**Chunk 36 — Range presets + picker polish + tab keyboard nav** _(F7, F9)_

*Prompt:*
```
Controls polish: 1) Add "This month" and "Last month" presets to RANGE_PRESETS in app/lib/range.ts (calendar-month windows via date-fns startOfMonth/endOfMonth, clamped to today; keys "tm"/"lm"), flowing through resolveRange, searchParams PRESET_IDS, and DashboardControls buttons — comparison "prior period" for them = previous calendar month, prior-year = same month last year; add range.test.ts cases. 2) Day-picker: Escape closes the popover (keydown handler alongside the backdrop), and theme react-day-picker to the design system in globals.css (square corners — override its border-radius vars, brand-primary selection, Montserrat). 3) View tabs in DashboardBody.tsx: ArrowLeft/ArrowRight move focus+selection per WAI-ARIA tabs pattern. Typecheck, suite, build, commit, push.
```

---

**Chunk 37 — KPI icon coverage + narratives for AI/SEO** _(F10)_

*Prompt:*
```
1) app/components/Icons.tsx maps stat labels to Tabler icons but the newer KPIs fall through to the default: add mappings for AI Score (IconSparkles), AI-referred sessions (IconRobot or IconMessageChatbot), Backlinks (IconLink), Index coverage (IconListCheck), Not indexed (IconListX or similar), Crawl errors (IconBug), Pages in index (IconFiles), Avg. session duration (IconClock), Conversions (IconTargetArrow) — verify each exists in @tabler/icons-react and pick close alternatives where not.
2) app/lib/narrative.ts builds the summary only from generic stat deltas — extend it to surface notable AI/SEO facts when present: AI Score grade + AI sessions trend when AI-referred sessions delta is significant, crawl errors > 0 as a caution item, backlinks total on first mention. Keep it rule-based, ≤ 4 items, tests in narrative.test.ts updated.
Typecheck, suite, build, commit, push.
```

---

## 5. Suggested order

```
Phase 0 (correctness):        1 → 2 → 3 → 4 → 5        ← do first, in order
Quick trust wins:             30, 33, 7                ← tiny; any time, even before Phase 0
Phase 1 (QC):                 6, 8, 9, 10              ← any order, parallelizable
Phase 6 (UX):                 31, 32 (after 2), 34, 35, 36, 37   ← 32 depends on Chunk 2
Phase 2 (live data):          11, 12, 13               ← as human inputs (H2–H5) arrive
Phase 3 (product):            14 → 15, then 16–19      ← 14 is the high-value one
Phase 4 (backend):            20 → 21 → 22 → {23, 24, 25} → 26
Phase 5 (ops):                27 anytime (early is better) · 28 if H8 says gate · 29 last
```

Rationale: Phase 0 first because compare/custom-range numbers are **wrong** on live data today and caching protects quota the moment more sources go live. Chunks 30 + 33 are the two fastest trust fixes in the plan (client-visible dev copy; public client roster) — do them the same day. Chunk 27 (CI) is cheap insurance — fine to run it right after Phase 0. Chunk 32 waits for Chunk 2 (both touch compare rendering). Chunk 22 must precede any real data in the lake.

## 6. Env var checklist (Vercel, production)

| Var | Status | Needed for |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | ✅ set (per user) | GA4, SC, (Ads OAuth), gsheets |
| `SEMANTIC_API_URL` / `SEMANTIC_API_TOKEN` | ✅ set (token = …acac… variant) | Explore | 
| `BING_WEBMASTER_API_KEY` | ⬜ H1 | backlinks/crawl |
| `GOOGLE_ADS_DEVELOPER_TOKEN` (+ `_LOGIN_CUSTOMER_ID`) | ⬜ H3 | Ads |
| `CRON_SECRET` | ⬜ H4 | debug gate, cron, reports |
| `RESEND_API_KEY`, `REPORT_FROM`, `CHROMIUM_EXECUTABLE_PATH` | ⬜ H5 | email reports (PDF works without Resend) |
| `MAILCHIMP_API_KEY`, `HUBSPOT_ACCESS_TOKEN`, `YOUTUBE_API_KEY` | ⬜ H6 | those sources |
| `ANTHROPIC_API_KEY` | ⬜ (Chunk 26) | NLQ |

## 7. Per-client status matrix (today)

| Client | GA4 | Search Console | Bing | Ads | Other |
|---|---|---|---|---|---|
| artform | ✅ 310586485 | ✅ artformagency.com | 🔑 key | ⬜ id+token | linkedin ⬜, mailchimp 🔑 |
| bbbnp | ✅ 302989852 + CISR/IRI 499713205 | ✅ bbbprograms.org | 🔑 | ⬜ | mailchimp 🔑 |
| isea | ✅ 333478304 | ✅ safetyequipment.org | 🔑 | — | linkedin ⬜, mailchimp 🔑 |
| maximus | ✅ 302350399 | ✅ maximus.com | 🔑 | — | linkedin ⬜ |
| miami-federal | ✅ 521857796 | ⬜ URL needed | ⬜ URL | ⬜ | — |
| moveinterstate | ✅ 223367126 | ✅ moveinterstate.com | 🔑 | ⬜ | — |
| sigma-defense | ✅ 298141839 | ⬜ URL needed | ⬜ URL | — | linkedin ⬜ |
| winterscale | ✅ 398292533 | ⬜ URL needed | ⬜ URL | — | linkedin ⬜ |
| govcon-ideators | ✅ 395344759 | ⬜ URL needed | ⬜ URL | — | linkedin ⬜, hubspot 🔑 |

✅ = config real (live once creds present) · 🔑 = needs only the shared key/env · ⬜ = needs per-client info (see §3) · — = source not configured

---

*Maintain this file: check off chunks as they land, and move anything newly discovered into §2 with a severity.*
