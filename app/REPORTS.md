# PDF & email reports

Turn any client dashboard into a branded PDF — downloadable on demand, emailable,
or sent on a schedule.

## How it works

- **Print mode**: `/<slug>?print=1` renders the dashboard with every source
  expanded and the UI chrome (controls, tabs) hidden.
- **PDF**: `lib/report/render.ts` drives headless Chromium (`playwright-core`)
  over that URL and returns a PDF (`page.pdf()`, A4, print media).
- **Email**: `lib/report/email.ts` sends the PDF via **Resend** with a
  [react-email](https://react.email) template (`emails/ReportEmail.tsx`).

Everything degrades gracefully: with no `RESEND_API_KEY`, PDF download still
works and emails are skipped with a clear reason.

## The three entry points

| Action | Endpoint | Auth |
| --- | --- | --- |
| Download PDF | `GET /api/report/<slug>` (the **Download PDF** button) | none (same as the public dashboard) |
| Email one client now | `POST /api/report/<slug>` body `{ "to": [...] }` | `CRON_SECRET`/`REPORT_TOKEN` bearer (if set) |
| Scheduled reports | `GET /api/cron/reports` | `CRON_SECRET` bearer, or Vercel cron header |

The download/email links carry the currently-viewed `range`/`compare`, so the
report matches what's on screen.

## Per-client config

In `config/clients.ts`, opt a client into scheduled reports:

```ts
{
  slug: "umbrella",
  name: "Umbrella Software",
  report: { recipients: ["ops@umbrella.example"], enabled: true },
  sources: [ /* … */ ],
}
```

The cron (`/api/cron/reports`) emails every client with `report.enabled` and at
least one recipient. The schedule lives in `vercel.json`
(`0 13 * * 1` — Mondays 13:00 UTC).

## Environment

```sh
RESEND_API_KEY=re_...                         # omit → emails skipped, PDF still works
REPORT_FROM="ArtForm Reports <reports@artform.agency>"
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium    # the PDF renderer's browser
CRON_SECRET=...                               # protects POST + cron
```

## Local testing

```sh
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium pnpm --filter @artform/dashboards start
# Download a PDF:
curl -o report.pdf http://localhost:3000/api/report/acme
# Dry-run the cron (emails skipped without a key):
curl http://localhost:3000/api/cron/reports
```

## Deploying on Vercel

This works out of the box. `lib/report/render.ts` resolves the browser
automatically:

- **Local / self-hosted** — set `CHROMIUM_EXECUTABLE_PATH` to a Chromium binary.
- **Serverless (Vercel)** — leave `CHROMIUM_EXECUTABLE_PATH` unset; the renderer
  falls back to **@sparticuz/chromium**'s bundled binary (already a dependency,
  dynamically imported so it isn't loaded in dev).

So on Vercel you only need to add `RESEND_API_KEY`, `REPORT_FROM`, and
`CRON_SECRET` in project env. The report routes already run on the Node runtime
with a raised `maxDuration`; `@sparticuz/chromium` is externalized; and its
`bin/*.br` browser files are force-included into the report functions via
`experimental.outputFileTracingIncludes` in `next.config` (otherwise Next's
tracer omits them, since they're read from disk rather than `require`d, and you
get `The input directory ".../@sparticuz/chromium/bin" does not exist`). Cron
requires a Vercel plan that includes Cron Jobs.

> If a Playwright/Chromium version mismatch ever surfaces, pin `@sparticuz/chromium`
> to the build that matches your `playwright-core` version.
