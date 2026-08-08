# Derby Streams

## Overview

Derby County fixtures plus matchday stream links, scraped on a schedule and served as a fully static GitHub Pages site. A Bun CLI (`apps/scraper`) pulls the fixture list from football-data.org and, when a match is upcoming or live, scrapes stream links from a handful of aggregator sites via per-site adapters. The results are written to committed `data/*.json`, which the React web app (`apps/web`) reads at build and browse time. There is no server and no database — the committed JSON **is** the data store, refreshed every 15 minutes during a match by CI.

## Architecture

```
derby-streams/
  package.json            # Bun workspaces (apps/*, shared) + root scripts
  .github/workflows/
    scrape.yml            # scheduled scraper: pre-warm + in-match refresh, commits data/
    deploy.yml            # builds apps/web, deploys to GitHub Pages
  apps/
    scraper/              # Bun CLI: fixtures + stream adapters + orchestrator
      src/
        index.ts          # CLI entry (arg parsing, error handling, exit codes)
        config.ts         # team id, API base URL, SITES map, fixture statuses
        fixtures.ts       # football-data.org client
        streams.ts        # orchestrator: run adapters, dedupe, merge, write data/streams.json
        lib/
          html.ts         # fetch + cheerio parsing, Playwright fallback
        aggregators/      # one adapter per source (totalsportek, soccerstreams, footybite, hesgoal)
    web/                  # React + Vite + Tailwind static site
      src/
        App.tsx           # fixture list + match detail views
        data.ts           # typed client that fetches committed JSON with runtime validation
  shared/
    types.ts              # Fixture, StreamLink, StreamSource, StreamsByFixture, DataFiles
  data/
    fixtures.json         # committed by CI after each scrape run
    streams.json          # streams for the current/upcoming match
```

`shared/types.ts` defines the contracts both sides build against (`Fixture`, `StreamLink`, `StreamSource`, `StreamsByFixture`, `DataFiles`) plus the `STREAM_SOURCES` list that drives the orchestrator.

## Prerequisites

- **Bun >= 1.3** (the repo uses Bun workspaces; CI pins Bun 1.3.9).
- **A free football-data.org API token** — register at <https://www.football-data.org/> and get a key under the free tier.
  - Free tier limits: **10 requests/min** (no documented daily cap for registered users).
  - The free tier covers 12 competitions including the Championship, but **FA Cup / EFL Cup are restricted** — cup fixtures may be omitted or return a 403. Verify on a real run if you need cups.
- The scraper targets **Derby County, team id `342`** (`TEAM_ID` in `apps/scraper/src/config.ts`). Note `345` is **Sheffield Wednesday** — the id was verified in `research/team-id.md`.

## Setup

```sh
bun install
```

Create your local env file from the example and set your token:

```sh
cp .env.example .env
# then edit .env and set FOOTBALL_DATA_KEY=your-token
```

`.env.example` documents the single env var the scraper reads: `FOOTBALL_DATA_KEY`. `.env.github` shows the equivalent mapping used in CI (`FOOTBALL_DATA_KEY=${{ secrets.FOOTBALL_DATA_KEY }}`).

## Running the scraper

All commands run through the workspace filter so Bun picks up the scraper's own `start` script:

```sh
# Scrape the next upcoming/live fixture (pre-warm or in-match refresh)
bun run --filter '@derby-streams/scraper' start next

# Force a specific fixture by football-data.org id (works for finished matches too)
bun run --filter '@derby-streams/scraper' start <fixture-id>

# No argument behaves exactly like `next` (also accepts `next-kickoff`)
bun run --filter '@derby-streams/scraper' start
```

Each run writes two files:

- `data/fixtures.json` — the fixture list (always written).
- `data/streams.json` — stream links for the scraped target fixture (written once streams are collected; `[]` when nothing was scraped).

Exit codes: `0` success, `1` on errors (auth / rate-limit / network / football-data / fixture-not-found), `2` on bad usage. An auth failure prints `[scraper] auth failed: FOOTBALL_DATA_KEY is not set; add it to your environment (e.g. .env) before querying football-data.org`.

Stream scraping uses plain `fetch` + cheerio. Playwright is only needed on the **best-effort fallback path** — if a site blocks plain fetch (e.g. a Cloudflare 403), the adapter retries through a headless browser. Playwright browsers are installed lazily/optionally (see CI), so you don't need them for basic runs.

## Running the web app

```sh
# Local development with Vite dev server
bun run --filter '@derby-streams/web' dev

# Build the static site from the root (runs the web workspace's vite build)
bun run build
```

The Vite config sets `base: "./"` and copies `data/*.json` into `dist/data` at build time, so the built site has the data baked in. `apps/web/src/data.ts` fetches the relative `data/fixtures.json` / `data/streams.json` at runtime and validates their shape (throwing a `DataError` on malformed data).

## CI / GitHub Actions

**`scrape.yml`** — the scheduled scraper:

- Runs on a fixed cron (`*/15 * * * *`, every 15 min) via `schedule`, plus a manual `workflow_dispatch` trigger with an optional `fixture_id` input (empty → the CLI runs `next`; filled in → scrapes that specific fixture, finished ones included).
- Feeds `FOOTBALL_DATA_KEY` from the repo secret into the scraper's env, and **fails fast** if the secret isn't set.
- The CLI decides per run: no upcoming/live match → pre-warm (commit fixtures only, skip scraping); upcoming/live match → scrape streams and commit everything. Unknown/empty schedules idle cheaply.
- Commits `data/` with the message `chore(data): update fixtures and streams [skip ci]` as the bot user `derby-streams-bot` (only when there are changes). The `[skip ci]` marker prevents the push from re-triggering workflows.

**One-time setup:** add the API token as a repository secret named `FOOTBALL_DATA_KEY` under **Settings > Secrets and variables > Actions**.

**`deploy.yml`** — Pages deployment:

- Triggers on push to `main` (plus `workflow_dispatch`).
- Typechecks and builds `apps/web`, then deploys `apps/web/dist` to GitHub Pages via `configure-pages@v5` / `upload-pages-artifact@v3` / `deploy-pages@v4`.

## Adapter-maintenance notes

The stream sources are legally gray, ad-heavy aggregator sites whose **domains and DOM structure rotate constantly**. Expect to maintain them.

**Adapter contract** (one file per source in `apps/scraper/src/aggregators/`, exported through `index.ts` as namespaced modules):

- `export const source: StreamSource` — the source id (matches `STREAM_SOURCES`).
- `scrapeFixture(fixture, opts?)` → `Promise<StreamLink[]>` — extracts links for the given fixture.
- Adapters **never throw** on HTTP/network failure — they catch and return `[]`. A blocked/4xx/network page is "nothing found" for that source, not an error.

**Orchestrator** (`apps/scraper/src/streams.ts`):

- Runs all adapters **sequentially** (politeness — the sites are rate-limit sensitive and concurrent bursts risk an IP ban).
- Dedupes across sources **by URL, keeping the first-seen entry** (stable, deterministic run-to-run).
- Each adapter runs in its own `try/catch` — one broken site never takes the pipeline down.

**The critical symptom to watch for:** a broken adapter surfaces as **0 links from that source** in `data/streams.json` — not a crash. The run still exits 0. So when streams look thin or a source goes missing:

1. Check `data/streams.json` for which `source` ids are absent.
2. Reconcile the site URL in the `SITES` map in `apps/scraper/src/config.ts` (domains churn — totalsportek has rotated through `.com` / `.watch` / `.net`).
3. Reconcile the selectors in the matching `aggregators/<source>.ts` (selectors are isolated in constants at the bottom of each adapter file as the single maintenance point for DOM drift).

Other behaviors worth knowing:

- Unknown fixture statuses are treated conservatively; the CLI idles cheaply (fetches + commits fixtures, skips scraping) when nothing is upcoming or live.
- `research/team-id.md` documents the Derby team-id investigation (342 vs 345) and free-tier coverage caveats.
- The "Future / stretch" list in `PLAN.md` (calendar view, alerts, watchlist, on-demand scrape button, always-on host migration, stream history persistence) is **not implemented**.

## Scripts reference

Root `package.json` scripts:

| Script | Runs |
| --- | --- |
| `bun run build` | Builds the web app (`bun run --filter '@derby-streams/web' build`) |
| `bun run typecheck` | Typechecks all three workspaces (shared, scraper, web) |
| `bun run lint` | Placeholder only — prints a note; no linter is configured |
