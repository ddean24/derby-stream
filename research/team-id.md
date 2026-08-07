# Research: Derby County team id + competition coverage on football-data.org

Research date: 2026-08-08 · Status: `done` (runtime re-verification still recommended)

## 1. Derby County team id — it is `342`, NOT `345`

The PLAN.md assumption of `345` is **wrong**. `345` is **Sheffield Wednesday**.

Evidence:

- [epijim/FootballData](https://github.com/epijim/FootballData) — an R package whose README was generated from live football-data.org API responses. Its `/v4/competitions/ELC/teams` output maps crest URLs per team:
  - **Derby County FC → `https://crests.football-data.org/342.svg`**
  - Middlesbrough FC → `343.svg`
  - **Sheffield Wednesday FC → `345.svg`**
  - Watford FC → `346.svg`
- The crest files themselves corroborate (fetched directly):
  - `https://crests.football-data.org/342.svg` → 386×259 px non-circular crest (Derby's ram emblem)
  - `https://crests.football-data.org/345.svg` → 200×200 px circular badge (Sheffield Wednesday's round badge)

Recommendation:

- Use team id **342** as the expected value in `config.ts`.
- Keep the plan's runtime fallback — `GET /v4/competitions/ELC/teams` — as a sanity check that 342 resolves to "Derby County FC" (cheap, one call, and it also double-checks the Championship roster). Do not hard-trust the id forever; football-data team ids are stable, but verify once at startup/scrape time.

## 2. Team-level matches call + free-tier rate limits

**Endpoint works as planned:** `GET /v4/teams/{id}/matches?status=...` returns a list of matches pre-filtered by that team across **every competition the team plays in**, one call, with a `competition` node on each match. Confirmed in the [Team docs (Match Subresource)](https://docs.football-data.org/general/v4/team.html).

**Free-tier limits (current docs/pricing):**

| Limit | Value | Source |
| --- | --- | --- |
| Requests/minute (registered free) | **10/min** | [Pricing](https://www.football-data.org/pricing), [Policies](https://docs.football-data.org/general/v4/policies.html), [Register](https://www.football-data.org/client/register) |
| Requests/day (registered free) | **No documented daily cap** | Policies page mentions only the per-minute limit for registered clients |
| Requests/24h (unauthenticated) | 100/24h — but only area + competition-list endpoints | Policies page |
| Included competitions (free) | **12** — includes Championship (ELC), NOT FA Cup / EFL Cup | [Coverage](https://www.football-data.org/coverage) |

So the plan's "10/min and 10/day" is half right: it is **10/minute**, and there is **no documented daily cap** for registered free users (the 100/24h figure applies to anonymous clients only).

**Budget math:** ~9 runs/matchday × 2–3 calls ≈ 18–27 calls/matchday, spread across the day (pre-warm + 15-min refreshes). At most 2–3 calls fall in any single minute — trivially inside 10/min, and no daily cap to worry about. **Free tier is sufficient for the planned schedule.**

**Coverage caveat (must verify at runtime):** the free tier's 12 competitions include the Championship but **not** the FA Cup (FAC) or EFL Cup (FLC). Expect either (a) those cup matches silently omitted from the team-matches response, or (b) a `403 Restricted Resource` when cup data is requested (403 is documented as "only available to clients with a paid subscription" — [Errors](https://docs.football-data.org/general/v4/errors.html)). Test the first run with a real key and confirm whether the one-call "Championship + FA Cup + EFL Cup" assumption actually holds on the free tier. If cup matches don't come back, plan a fallback source for FAC/FLC fixtures (or accept league-only).

## 3. Match `status` values and the `status` filter

From the [Lookup Tables](https://docs.football-data.org/general/v4/lookup_tables.html) and [Match docs](https://docs.football-data.org/general/v4/match.html):

Full status enum (v4): `SCHEDULED | TIMED | IN_PLAY | PAUSED | EXTRA_TIME | PENALTY_SHOOTOUT | FINISHED | SUSPENDED | POSTPONED | CANCELLED | AWARDED`

Happy flow: `SCHEDULED` (rough date) → `TIMED` (exact date/time) → `IN_PLAY` → `PAUSED` → `IN_PLAY` → `FINISHED`.

- The `status` **filter accepts a comma-separated list** — lookup_tables states: *"status — Drill down on a (comma separated list of) status"*. So `?status=SCHEDULED,TIMED,IN_PLAY` from PLAN.md is a valid query.
- Pseudo-status **`LIVE`** = `IN_PLAY` + `PAUSED`, accepted as a filter value.
- To also cover recent results, either add `FINISHED` to the list or make a second call with `?status=FINISHED&limit=...` (recent finished matches are useful for the results list; the free tier limits history to the current season).

## 4. Championship season code + Derby's division

- Championship league code: **`ELC`** (competition id `2016`) — confirmed in the [League-Codes lookup table](https://docs.football-data.org/general/v4/lookup_tables.html). Related codes: PL (2021), EL1 (2030), EL2 (2054), FAC (2055), FLC (2139).
- Derby was in the Championship for **2025-26** (finished **8th**, per ESPN/The Athletic) and is confirmed in the **2026-27** Championship (fixtures released 25 Jun 2026; opening fixture **Charlton Athletic v Derby County, 15 Aug 2026** — BBC/talkSPORT/Daily Star).
- Today (8 Aug 2026) the current season is **2026-27**, so `GET /v4/teams/342/matches` **without** a `season` param defaults to the current season and ELC fixtures will exist. Use `?season=2026` for the current season and `?season=2025` for last season's results.
- Derby will also have FA Cup (FAC, code 2055) and EFL Cup (FLC, code 2139) ties in-season — subject to the free-tier coverage caveat in §2.

## 5. Response shape + gotchas

**Team-matches response shape (v4):**

```
{
  "filters": { ... "permission": "TIER_ONE" ... },   // reflects your plan
  "resultSet": { "count", "competitions", "first", "last", "played", "wins", "draws", "losses" },
  "matches": [{
    "id", "utcDate", "status", "minute", "injuryTime", "attendance", "venue",
    "matchday", "stage", "group", "lastUpdated",
    "competition": { "id", "name", "code", "type", "emblem" },
    "season": { "id", "startDate", "endDate", "currentMatchday", "winner", "stages" },
    "homeTeam": { "id", "name", "shortName", "tla", "crest", "coach", "leagueRank", "formation", "lineup" },
    "awayTeam": { ...same as homeTeam... },
    "score": { "winner", "duration", "fullTime": { "home", "away" },
               "halfTime": { "home", "away" }, "extraTime", "penalties" },
    "referees": [ ... ], "odds": { ... }
  }]
}
```

Notes:

- In v4 the score is a **nested `score` object** (`score.fullTime.home`, `score.fullTime.away`, `score.winner`), not a flat `score.fullTime` scalar. The plan's shorthand is conceptually right; map from the nested object.
- Lineups/bookings/subs/goals are **folded out** of list responses unless you send `X-Unfold-Lineups`, `X-Unfold-Bookings`, `X-Unfold-Subs`, `X-Unfold-Goals: true` (folding is a documented policy — [Policies](https://docs.football-data.org/general/v4/policies.html)). For a fixture list you don't need them; leave folding on to save bandwidth.
- Result list default `limit` is 100 (max 500); `offset` is supported.
- Free tier: **"Scores delayed" and "Schedules delayed"** (per [Pricing](https://www.football-data.org/pricing); the €12 "Free w/ Livescores" plan adds live). Practical impact: during IN_PLAY, the live status/score you poll may lag the real match — the 15-min refresh cadence is fine, just don't promise real-time scores on the free key.

**Rate-limit / 429 handling:**

- `429 Too Many Requests` is documented ([Errors](https://docs.football-data.org/general/v4/errors.html)), but **football-data.org does NOT document a `Retry-After` header** — treat it as optional.
- What IS documented (see [Lookup Tables → Response Headers](https://docs.football-data.org/general/v4/lookup_tables.html)):
  - `X-RequestsAvailable` — remaining requests before being blocked
  - `X-RequestCounter-Reset` — seconds until the request counter resets
  - `X-API-Version`, `X-Authenticated-Client`
- Implementation guidance: read `X-RequestsAvailable` on every response and sleep if it is low; on a 429, honour `Retry-After` if present, otherwise fall back to exponential backoff (1s, 2s, 4s…) up to a cap. With 2–3 calls/run you will effectively never hit it.

## Sources

- Team resource & Match Subresource docs: https://docs.football-data.org/general/v4/team.html
- Match resource / status enum / status filter: https://docs.football-data.org/general/v4/match.html
- Lookup tables (enums, response headers, league codes): https://docs.football-data.org/general/v4/lookup_tables.html
- Policies (throttling, folding, running competitions): https://docs.football-data.org/general/v4/policies.html
- Errors (403/429 semantics): https://docs.football-data.org/general/v4/errors.html
- Pricing (free plan: 10 calls/min, scores/schedules delayed): https://www.football-data.org/pricing
- Coverage (free tier = 12 competitions; FA Cup/EFL Cup not listed): https://www.football-data.org/coverage
- Team-id/crest mapping (API-derived): https://github.com/epijim/FootballData
- Crest files (direct fetch): https://crests.football-data.org/342.svg and /345.svg
- Derby in 2025-26 Championship (finished 8th) + 2026-27 fixtures: https://www.espn.com/soccer/story/_/id/49173379/efl-championship-fixtures-schedule-2026-27-full · https://www.bbc.com/sport/football/articles/cjwg9l53evwo
