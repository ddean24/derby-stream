# Derby Streams — Improvements Roadmap

> Post-launch follow-up work. The original build plan + status checklist live in [PLAN.md](PLAN.md).
> Status markers match PLAN.md: `[ ]` not started · `[/]` in progress · `[x]` done · `[~]` blocked.

Recommended build order is top to bottom: each item is self-contained and commits are independent.

## 8.0 Freshness

### 8.1 Data-freshness indicator
- [x] Scraper writes `data/meta.json` with `{ scrapedAt, fixturesCount, streamsCount }` on every data-changing run (same writer style as fixtures/streams). Done: `ScrapeMeta` in shared/types.ts, `writeMeta`/`readMeta` in apps/scraper/src/io.ts, wired through `collectStreams`.
- [x] Web reads `data/meta.json` alongside fixtures/streams/history and shows "Data as of <x>" in the footer, with a subtle "may be stale" warning when data is older than ~30 min. Done: `fetchMetaOrNull` in apps/web/src/data.ts + `DataFooter` in App.tsx on list/match/calendar views.
- [x] Freshness writes are non-destructive and idempotent: `scrapedAt` only advances when streams/fixtures/history actually changed this run, so an idle CI run leaves `data/` untouched (`git diff --cached` stays empty and scrape.yml skips the commit). Done: gated meta write in `collectStreams` + `appendStreamHistory` returns a change flag; covered by apps/scraper/test/meta.test.ts.

### 8.2 PLAN.md stale-status cleanup
- [x] Mark the implemented scaffold/fixtures/scraping/CI/frontend checklist items in sections 1–6 as `[x]` so the doc reflects reality. Done in `08cd232` (sections 1–6 checked; team id corrected 345→342; next-match/countdown deferred to 8.4; item 6.3 adapter matchday smoke test left open as a real QA task).
- [x] Re-read PLAN.md once marked and prune any now-dead bullet (e.g. "placeholder build script" notes in deploy.yml). Done in `08cd232` (deploy.yml placeholder comments pruned, outDir coupling note tightened).
- [x] Cross-link PLAN.md ↔ ROADMAP.md headings so the two checklists are navigable from each other. Done in `08cd232` (both docs reference each other in the header).

## 8.3 PWA / installable + offline-matchday
- [x] Web app manifest (`name`, `short_name`, theme colour slate-950, icons) referenced from `index.html`. Done: public/manifest.webmanifest + generated PNG icons (apps/web/scripts/make-icon.mjs — zero-dependency PNG encoder, outputs icon-192/512 + apple-touch-icon).
- [x] Service worker that caches shell + committed `data/*.json` cache-first (data refreshed on each page load when online — stale-while-revalidate). Done: public/sw.js; registered in main.tsx on load (production only).
- [x] "Add to home screen" cooperative; Pages is HTTPS, manifest served with no conflicting strategies. Done (verified build copies manifest/sw.js/icons/robots.txt + data into dist).
- [x] Keep robots de-indexing intact — the manifest/meta noindex must not conflict. Done: robots.txt (`Disallow: /`) and `<meta name="robots" content="noindex, nofollow">` both still ship; a SW/manifest do not affect crawling.

## 8.4 Countdown & next-match highlight
- [x] Compute the nearest upcoming (or live) fixture; show "Up next: <home> vs <away>, <T-…>" pinned above the fixture list. Done: `nextFixture()` in apps/web/src/lib/countdown.ts + pinned banner (`NextMatchBanner`) above the list; reads "Live now / On now" while in-play.
- [x] Live countdown on the match detail page for upcoming fixtures (HH:MM:SS to kickoff, ticking via `setInterval`). Done: `useCountdown` (apps/web/src/useCountdown.ts) + `KickoffCountdown` on the detail page; hides once kickoff passes or the match goes live.
- [x] Highlight the "next" row in the fixture list (ring/badge), only when the match is the nearest upcoming. Done: amber `Next` badge on the fixture row (only when not live).

## 8.5 Dead / expired link markers
- [x] Web: intersect `stream-history.json` snapshots with latest `streams.json` per fixture; a URL present in history but absent from the current snapshot gets a "went down" (strikethrough + muted) treatment in the history timeline. Done: `findDeadLinks` in apps/web/src/lib/deadLinks.ts, wired into the `HistoryTimeline` in FixtureDetail.tsx.
- [x] Optionally tag "died between 14:05–14:20" style annotation using the first snapshot that lacked the link. Done: each dead link shows "went down between <lastSeen> and <firstAbsent>" from the timeline walk.
- [x] Only for FINISHED fixtures (a link may legitimately be missing mid-match during an adapter blip). Done: `findDeadLinks` early-returns unless `finished`.

## 8.6 Recurring adapter smoke test (non-matchday safety net)
- [x] New `apps/scraper` mode (`bun run … health` or a dedicated script) that hits the four aggregator sites, asserts each returns a parseable page (or at least a known-good HTTP status + nav pattern), and fails loudly. Done: `bun run start health` dispatches to `checkHealth()` in apps/scraper/src/health.ts — drives off `SITES` in config.ts, reuses `fetchHtml`, checks all sites (no short-circuit), exits non-zero on any failure.
- [x] New or extended GitHub Actions workflow on a nightly/weekly cron (or `workflow_dispatch`) that runs it; optionally pings Slack on failure — reuse the existing `SLACK_WEBHOOK_URL` no-op pattern. Done: `.github/workflows/health.yml` (weekly cron + workflow_dispatch); Slack ping handled inside the CLI with the existing unset-webhook no-op.
- [x] Keep isolation: a health failure should not re-run the real scraper, only surface. Done: the health mode never touches fixtures/streams/data or FOOTBALL_DATA_KEY, and the health workflow runs only `start health`.

## 8.7 Team crests
- [x] Use `crests.football-data.org/{teamId}.svg` (documented under research/team-id.md) as list-row + detail crests. Done: `TeamCrest` component (apps/web/src/components/TeamCrest.tsx) on fixture rows, next-match banner, and match-detail score card; cup/mobile calendar rows too.
- [x] Graceful fallback to a placeholder monogram when a crest 404s or is missing (teams without football-data crests). Done: `TeamCrest` renders a circular slate monogram from `shortName` when `team.crest` is null or the `<img>` errors; `isTeam` in apps/web/src/data.ts accepts an optional `crest` field.
- [x] Self-contained hosting: fetch crests server-side in the scraper and commit them under `data/crests/` rather than hotlinking the CDN, so the site stays self-contained if the CDN blocks hotlinking or goes away. Done: `fetchAllCrests` in apps/scraper/src/crests.ts (sequential, polite 250ms delay, failure-tolerant, dedupe + numeric-id only) wired into index.ts; `writeCrest`/`crestFilePath` in io.ts; web `vite.config.ts` copies `data/crests/` → `dist/crests/`. Sample crest committed: `data/crests/342.svg`.

## 8.8 Competition filter tabs
- [x] Add tab buttons (All / EFL Cup / FA Cup / Championship) on the fixture list; drive by the existing per-code badge colour map in `format.ts`. Done: `CompetitionFilterTabs` in App.tsx with per-tab fixture counts + badge-coloured dots.
- [x] Persist the selected competition in the URL hash (compat with current hash routing) and in localStorage. Done: list route carries `?comp=<code>` (extended `parseHash` in useHashRoute.ts); localStorage key `derby-streams:competition-filter` is both read (hash absent) and written on tab select.
- [x] Highlighted live-filter not to be confused with live-status grouping; sections remain Live/Upcoming/Finished within each tab. Done: the filter narrows the fixture arrays per tab; the Live/Upcoming/Finished sections are unchanged, and the `Next` banner/highlight operate on the filtered set.

## 8.9 (stretch) Link-dead report flow
- [ ] Tiny "link dead?" affordance per stream card (decide the backend given the no-server constraint; a plausible option is a GitHub Issue via `workflow_dispatch` reusing the existing fixture_id input).
- [ ] Natural spam guard (rate-limit per IP/day in localStorage-only terms, or a simple honeypot).

## 8.10 (stretch) Expected-next-refresh display
- [ ] In match detail, show "next refresh ~14:15" derived from meta.json + the fixed 15-min cycle.

## 8.11 (deliberately not doing)
- History-API URLs + `404.html` fallback — agreed to leave hash routing as-is.
- Server or DB for anything above — the committed-JSON-as-datastore stands.

---

_Update status in place as work lands; commit this file together with the change it documents._