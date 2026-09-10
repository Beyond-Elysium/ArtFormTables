# ArtFormTables

A monorepo for ArtForm dashboards and related web apps built on a shared Tabler-based design system.

This repository is not a generic Tabler theme project; it contains a real multi-client analytics stack that renders branded dashboards for each client under a path like `/acme` and pulls normalized metrics from many data sources.

## What this repo contains

- `app/` — the main Next.js dashboard application for multi-client, path-based analytics dashboards
- `core/` — the Tabler UI/design system package used by the apps
- `apps/arvo/` — a separate application in the same monorepo
- `shared/` and package directories — shared workspace packages for the broader repo
- `DashboardPlan.md` — project planning notes and architecture context

## Main product

The `app/` project ships a provider-agnostic dashboard system:

- client-specific routes generated from a registry of clients
- reusable connectors for analytics and marketing data sources
- normalized panel output (`stat`, `timeseries`, `breakdown`, `map`)
- URL-driven controls for date range, comparison windows, and view switching
- deterministic mock data fallbacks when credentials are absent
- report generation and AI-assisted exploration hooks

This is the project described in `app/README.md` and the supporting docs in:

- `app/README.md`
- `app/CONNECTORS.md`
- `app/ONBOARDING.md`
- `app/DEPLOY.md`
- `app/REPORTS.md`
- `app/config/EDITING.md`

## Example data sources supported

The dashboard connector framework supports many providers, including:

- Google Analytics 4
- Search Console
- Google Ads
- Bing Webmaster
- Meta Ads
- Shopify
- Stripe
- Plausible
- YouTube
- HubSpot
- GitHub
- Sentry
- Linear
- and more through the shared connector registry

See `app/lib/connectors/` for the implementation and `app/lib/connectors/index.ts` for the registry.

## Repository structure

```text
.
├── app/                     # dashboard app
│   ├── app/                # Next.js app routes
│   ├── components/         # dashboard UI pieces
│   ├── config/             # client configuration and schema
│   ├── lib/                # connectors, range logic, reports, AI helpers
│   ├── emails/             # report email templates
│   ├── .env.example        # environment variable template
│   ├── CONNECTORS.md       # connector catalog and guidance
│   ├── DEPLOY.md           # deployment notes
│   ├── ONBOARDING.md       # setup and onboarding docs
│   ├── REPORTS.md          # reporting flow
│   ├── README.md           # app-specific project guide
│   └── package.json        # dashboard app package
├── core/                   # Tabler design system package
├── apps/arvo/              # another app in the monorepo
├── package.json            # root workspace configuration
├── pnpm-workspace.yaml     # pnpm workspace layout
├── DashboardPlan.md        # internal planning notes
├── LICENSE                 # repo license
├── README.md               # this file
└── .changeset/             # release metadata
```

## Local development

From the repository root:

```bash
pnpm install
pnpm dev
```

If you want to run only the dashboard app:

```bash
pnpm --filter @artform/dashboards dev
```

Then open the app in a browser, typically on:

- http://localhost:3000
- specific client routes like http://localhost:3000/acme

The app is designed to render with demo data even when no live credentials are configured, and flip to live data automatically when the required environment variables and client config are present.

## Environment setup

The dashboard app expects provider configuration in environment variables and client configuration. Start with:

```bash
cp app/.env.example app/.env.local
```

Then follow the app docs in `app/README.md` and `app/CONNECTORS.md` for the exact provider setup needed for your sources.

## Project status

This repo is a working monorepo for an ArtForm dashboard platform, with the primary implementation living under `app/` and the design system under `core/`.

The root README is intentionally focused on the actual repository purpose instead of the upstream Tabler project template it previously inherited.

## Related documentation

- `app/README.md` — app overview and architecture
- `app/CONNECTORS.md` — provider catalog and connector authoring steps
- `app/DEPLOY.md` — deployment and hosting runbook
- `app/ONBOARDING.md` — adding and managing client dashboards
- `app/REPORTS.md` — report generation flow
- `app/config/EDITING.md` — client config editing guide

