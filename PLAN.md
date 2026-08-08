# Derby Streams — Project Plan & Checklist

Website that lists every Derby County FC fixture and, on matchday, finds and links out to all available streams for that game.

## Stack

- Bun workspace (strict TypeScript everywhere)
- `apps/scraper` — Bun/Node CLI run as a scheduled GitHub Actions workflow
- `apps/web` — React + Vite + Tailwind (static site, no server)
- Fixtures: football-data.org (free tier, `X-Auth-Token`)
- Streams: scraping of aggregator sites via adapters (fetch + cheerio, Playwright fallback)
- Hosting: static deploy (GitHub Pages) fed by committed `data/*.json` produced by CI

## Architecture

```
derby-streams/
  package.json            # bun workspaces + scripts
  .github/workflows/
    scrape.yml            # scheduled scraper: pre-warm + in-match refresh, commits data/
    deploy.yml            # builds web/, deploys to GitHub Pages
  apps/
    scraper/              # Bun CLI, no server
      src/
        index.ts          # CLI entry: run for a fixture id or "next kickoff"
        fixtures.ts       # football-data.org client
        streams.ts        # orchestrator: run adapters, dedupe, merge, write data/*.json
        config.ts         # site list, team id, API key
        lib/
          html.ts         # fetch + cheerio helpers, polite rate limiting
          nameMatch.ts    # team-name normalisation/matching
        aggregators/      # one adapter per source site
          totalsportek.ts
          soccerstreams.ts
          footybite.ts
          hesgoal.ts
    web/                  # Vite + React + Tailwind (static)
      src/
        App.tsx           # fixture list + match detail views
        data.ts           # typed client that fetches committed JSON
        components/       # MatchCard, StreamList, Countdown, etc.
  shared/
    types.ts              # Fixture, StreamLink, StreamSource types
  data/
    fixtures.json         # committed by CI after each scrape run
    streams.json          # streams for the current/upcoming match
```

## Key decisions

- **Hosting:** GitHub Actions scheduled workflows + GitHub Pages static site. Free forever (public repos get unlimited Actions minutes; private repos get 2,000/mo — our worst case is ~200–320 min/mo). No cold starts, no server to manage. Playwright runs fine in CI.
- **Fixtures:** `GET /v4/teams/345/matches?status=SCHEDULED,TIMED,IN_PLAY` covers Championship + FA Cup + EFL Cup in one call. Derby's team id is 345 (verify at runtime; fallback: `GET /v4/competitions/ELC/teams`).
- **Streams:** adapter per source site, isolated so one broken site doesn't take the pipeline down; domains churn, so the source list lives in `config.ts`. Sites are legally gray and ad-heavy — expect adapter maintenance.
- **Scheduling:** GitHub Actions cron runs the scraper ~1h before each kickoff (pre-warm) then every 15 min while the match is live, committing results to `data/`. 5-min minimum granularity is fine. Schedule delays of a few minutes are fine because pre-warm runs early. No on-demand live scraping — the site shows the latest committed snapshot, refreshed every 15 min during the match.
- **Frontend:** fully static. Reads committed JSON, polls/re-fetches it every ~60s, auto-refreshes during a live match.
- **State:** results live in committed `data/*.json` (single overwritten files, not append-only, to keep git history small). No database.

## GitHub Actions free-tier math

- ~9 scraper runs per matchday (~1 pre-warm + ~7 in-match 15-min refreshes + 1 finalize), ~3–5 min each
- ≈ 27–45 min per matchday; busiest month (cup ties) ≈ 7 matchdays ≈ **200–320 min/month**
- Private repo cap is 2,000 min/mo (~10% usage). Public repo = unlimited.
- 1 concurrent job on free — fine, we run sequentially.

---

## Checklist

> Update status as we go: `[ ]` not started · `[/]` in progress · `[x]` done · `[~]` blocked

### 1. Scaffolding
- [ ] Create Bun workspace root `package.json` with `apps/scraper` and `apps/web` workspaces
- [ ] Add shared workspace `shared/` with `Fixture`, `StreamLink`, `StreamSource` types
- [ ] Set up strict TypeScript config (shared + per-app)
- [ ] Add `.env.example` / `.env.github` (`FOOTBALL_DATA_KEY`)
- [ ] Add root scripts: `build`, `typecheck`, `lint`

### 2. Fixtures (football-data.org)
- [ ] Confirm Derby County team id (expected 345) and that Championship + FA Cup + EFL Cup fixtures come back
- [ ] Implement `fixtures.ts` client: fetch upcoming/recent matches, map to `Fixture` type
- [ ] Write fixtures to `data/fixtures.json`
- [ ] Handle rate limits (429), auth failure, and network errors gracefully

### 3. Stream scraping
- [ ] Build `html.ts`: fetch helper with headers, timeouts, polite delay, cheerio parse; Playwright fallback plumbing
- [ ] Build `nameMatch.ts`: normalise team names ("Derby County"/"Derby", "West Ham United"/"West Ham") and match a fixture to a site listing
- [ ] Adapter: totalsportek
- [ ] Adapter: soccerstreams.net
- [ ] Adapter: footybite
- [ ] Adapter: hesgoal
- [ ] `streams.ts` orchestrator: run all adapters, dedupe by URL, merge into one `StreamLink[]`, tag with source, write `data/streams.json`

### 4. Scheduling & CI
- [ ] `scrape.yml`: scheduled workflow (cron) — pre-warm ~1h before kickoff, refresh every 15 min while live, commit `data/`
- [ ] `deploy.yml`: build `apps/web`, deploy to GitHub Pages
- [ ] Manual `workflow_dispatch` trigger for ad-hoc scrape runs
- [ ] Secret wiring for `FOOTBALL_DATA_KEY`

### 5. Frontend (React + Vite + Tailwind)
- [ ] Scaffold Vite React app with Tailwind, strict TS
- [ ] `data.ts` typed client fetching committed JSON
- [ ] Fixture list view: grouped by competition, next-match highlight, live badge, countdown, results for finished games
- [ ] Match detail view: stream list (source, quality, language) linking out; auto-refresh while live
- [ ] Empty/loading/error states (no streams yet, scraper failed, match finished)

### 6. Integration & polish
- [ ] `bun run build` + `bun run typecheck` green across the repo
- [ ] Smoke-test fixtures with a real key
- [ ] Smoke-test each stream adapter on a real matchday listing; verify dedupe/merge output
- [ ] README with setup/run instructions and adapter-maintenance notes

### 7. Future / stretch (not now)
- [x] Matchday calendar view
- [x] Push/email/slack alert when streams go live (Slack webhook; one-shot per fixture via `data/alerts.json`)
- [x] Watchlist / notify-me for specific fixtures (localStorage watchlist + browser Notifications)
- [x] On-demand "scrape now" affordance (deep-link to existing `workflow_dispatch`; a live token would leak from a static client)
- [x] ~~Migrate to a permanent always-on host (e.g. Oracle Always Free VM) if the free-tier limits are ever hit~~ — deliberately skipped (staying on GitHub Pages)
- [x] Persist stream history so replays/broken links are visible after the match (data/stream-history.json + timeline on the match page)
