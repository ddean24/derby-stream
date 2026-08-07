# Derby Streams — Project Plan & Checklist

Website that lists every Derby County FC fixture and, on matchday, finds and links out to all available streams for that game.

## Stack

- Bun workspace monorepo (strict TypeScript everywhere)
- `apps/api` — Hono server (Bun runtime)
- `apps/web` — React + Vite + Tailwind
- Fixtures: football-data.org (free tier, `X-Auth-Token`)
- Streams: scraping of aggregator sites via adapters (fetch + cheerio, Playwright fallback)

## Architecture

```
derby-streams/
  package.json            # bun workspaces + scripts
  apps/
    api/                  # Hono server (Bun runtime)
      src/
        index.ts          # Hono app + static file serving
        fixtures.ts       # football-data.org client + cache
        streams.ts        # orchestrator: run adapters, dedupe, merge
        cache.ts          # TTL cache (memory + optional JSON file)
        config.ts         # site list, team id, API key
        lib/
          html.ts         # fetch + cheerio helpers, polite rate limiting
          nameMatch.ts    # team-name normalisation/matching
        aggregators/      # one adapter per source site
          totalsportek.ts
          soccerstreams.ts
          footybite.ts
          hesgoal.ts
    web/                  # Vite + React + Tailwind
      src/
        App.tsx           # fixture list + match detail views
        api.ts            # typed API client
        components/       # MatchCard, StreamList, Countdown, etc.
  shared/
    types.ts              # Fixture, StreamLink, StreamSource types
```

## Key decisions

- **Fixtures:** `GET /v4/teams/345/matches?status=SCHEDULED,TIMED,IN_PLAY` covers Championship + FA Cup + EFL Cup in one call. Derby's team id is 345 (verify at runtime; fallback: `GET /v4/competitions/ELC/teams`).
- **Streams:** adapter per source site, isolated so one broken site doesn't take the site down; domains churn, so the source list lives in `config.ts`. Sites are legally gray and ad-heavy — expect adapter maintenance.
- **Timing:** streams scraped on demand; server pre-warms each fixture ~1h before kickoff and refreshes during the match (15-min TTL).
- **API:** `GET /api/fixtures`, `GET /api/matches/:fdId/streams`, `GET /api/health`. Hono serves the built frontend in prod; Vite proxies to it in dev.

---

## Checklist

> Update status as we go: `[ ]` not started · `[/]` in progress · `[x]` done · `[~]` blocked

### 1. Scaffolding
- [ ] Create Bun workspace root `package.json` with `apps/api` and `apps/web` workspaces
- [ ] Add shared workspace `shared/` with `Fixture`, `StreamLink`, `StreamSource` types
- [ ] Set up strict TypeScript config (shared + per-app)
- [ ] Add `.env.example` (`FOOTBALL_DATA_KEY`, API port, site list overrides)
- [ ] Add root scripts: `dev`, `build`, `typecheck`, `lint`

### 2. Fixtures (football-data.org)
- [ ] Confirm Derby County team id (expected 345) and that Championship + FA Cup + EFL Cup fixtures come back
- [ ] Implement `fixtures.ts` client: fetch upcoming/recent matches, map to `Fixture` type
- [ ] Implement `cache.ts` with TTL (fixtures ~1h)
- [ ] Handle rate limits (429), auth failure, and network errors gracefully
- [ ] `GET /api/fixtures` endpoint returning fixtures grouped/ordered sensibly

### 3. Stream scraping
- [ ] Build `html.ts`: fetch helper with headers, timeouts, polite delay, cheerio parse; Playwright fallback plumbing
- [ ] Build `nameMatch.ts`: normalise team names ("Derby County"/"Derby", "West Ham United"/"West Ham") and match a fixture to a site listing
- [ ] Adapter: totalsportek
- [ ] Adapter: soccerstreams.net
- [ ] Adapter: footybite
- [ ] Adapter: hesgoal
- [ ] `streams.ts` orchestrator: run all adapters, dedupe by URL, merge into one `StreamLink[]`, tag with source
- [ ] Per-match cache (TTL ~15 min) with pre-warm timer ~1h before kickoff + refresh while live
- [ ] `GET /api/matches/:fdId/streams` endpoint

### 4. Frontend (React + Vite + Tailwind)
- [ ] Scaffold Vite React app with Tailwind, strict TS
- [ ] `api.ts` typed client + proxy setup
- [ ] Fixture list view: grouped by competition, next-match highlight, live badge, countdown, results for finished games
- [ ] Match detail view: stream list (source, quality, language) linking out; auto-refresh while live
- [ ] Empty/loading/error states (no streams yet, scraper failed, match finished)

### 5. Integration & polish
- [ ] Hono serves built frontend in production
- [ ] Workspace root scripts run both apps in dev
- [ ] `bun run build` + `bun run typecheck` green across the repo
- [ ] Smoke-test fixtures with a real key
- [ ] Smoke-test each stream adapter on a real matchday listing; verify dedupe/merge output
- [ ] README with setup/run instructions and adapter-maintenance notes

### 6. Future / stretch (not now)
- [ ] Matchday calendar view
- [ ] Push/email/slack alert when streams go live for a match
- [ ] Watchlist / notify-me for specific fixtures
- [ ] Deploy config (e.g. Fly.io / Vercel / docker)
- [ ] Persist stream history so replays/broken links are visible after the match
