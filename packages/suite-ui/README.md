# @artform/suite-ui

Shared visual layer for the ArtForm Intelligence Suite (Arvo, Vantage, Orbit,
Pulse). It follows the same override pattern as the existing ArtForm
Dashboards product (`app/app/globals.css`): CSS custom properties layered on
top of `@tabler/core`'s `--tblr-*` variables, rather than a rebuild on a
different design system. The Suite's brand (navy / hot pink / cyan) is
distinct from the Dashboards product's brand and keeps Tabler's default
rounded corners instead of the Dashboards' zeroed "Swiss" radii.

## Using the theme

In each consuming Next.js app's root layout, import Tabler's core CSS, then
this package's theme on top of it, and add the two Google Fonts links to
`<head>`:

```tsx
import "@tabler/core/dist/css/tabler.min.css";
import "@artform/suite-ui/theme.css";
```

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=DM+Sans:wght@400;500;700&display=swap"
  rel="stylesheet"
/>
```

TODO for the consuming app teams: add those font links to each product's own
`<head>` (root `layout.tsx`) — `theme.css` only declares the `font-family`
overrides, it does not load the fonts.

## Components

```tsx
import {
  ScoreRing,
  SCORE_BANDS,
  BenchmarkGauge,
  DeltaPill,
  RadarComparison,
  CsvImportWizard,
} from "@artform/suite-ui";
```

- **ScoreRing** — 0–100 score donut, color-banded via `SCORE_BANDS`
  (critical / needs work / good / excellent). Import `SCORE_BANDS` wherever
  else a product needs the same thresholds (e.g. a table cell or legend).
- **BenchmarkGauge** — horizontal gauge plotting a value against p25/p50/p75
  markers, used for Arvo's Flight Performance Tracker.
- **DeltaPill** — `+12.4%` / `-3.1%` badge. Pass `positive` explicitly rather
  than assuming up is good — some metrics (e.g. cost-per-lead) invert.
- **RadarComparison** — thin `react-apexcharts` radar wrapper for Pulse's
  competitor-vs-client comparison.
- **CsvImportWizard** — 3-step (Upload → Map Columns → Preview & Confirm)
  stepper shell. It only reads a CSV's header row for the mapping UI; full
  parsing (quoted fields, etc.) is Arvo's job with Papa Parse before calling
  `onComplete`.

## TODOs left for a human

- Add the Barlow Condensed / DM Sans `<link>` tags to each product's root
  layout `<head>` (Arvo, Vantage, Orbit, Pulse) — not done here since those
  apps don't exist yet.
- `RadarComparison` uses `next/dynamic` for SSR-safe chart loading, matching
  `app/components/Charts.tsx`'s pattern — confirm this holds for all four
  products (all are planned as Next.js apps per the spec).
- `CsvImportWizard`'s CSV parsing is a naive `split(",")` placeholder good
  enough to drive the mapping UI; swap in Papa Parse when wiring real
  imports.
