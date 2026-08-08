import type { FixtureStatus, StreamSource } from "@derby-streams/shared";

export const TEAM_ID = 342; // Derby County FC on football-data.org — see research/team-id.md (345 is Sheffield Wednesday)

export const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";

// Crest CDN (documented under research/team-id.md). The scraper downloads these
// server-side into data/crests/ and the web self-hosts them rather than
// hotlinking this CDN (ROADMAP.md item 8.7).
export const CRESTS_BASE_URL = "https://crests.football-data.org";

// Stream-aggregator base URLs. These domains churn constantly (totalsportek
// alone has rotated through .com/.watch/.net), so this list is a maintenance
// point: bump a URL here AND reconcile the selectors in the matching adapter
// (see apps/scraper/src/aggregators/) when a site moves.
export const SITES: Readonly<Record<StreamSource, readonly string[]>> = {
	totalsportek: ["https://totalsportek.com/"],
	soccerstreams: ["https://soccerstreams.net/"],
	footybite: ["https://footybite.to/"],
	hesgoal: ["https://hesgoal.tv/"],
};

export const FOOTBALL_DATA_KEY: string = process.env.FOOTBALL_DATA_KEY ?? "";

export const FIXTURE_STATUSES: readonly FixtureStatus[] = [
	"SCHEDULED",
	"TIMED",
	"IN_PLAY",
	"PAUSED",
	"FINISHED",
];

// Cup competitions are NOT covered by the free football-data.org key (it only
// returns the Championship fixture List for the team). They come from the
// Wikipedia season page instead — see cupFixtures.ts. Competition codes follow
// football-data's own conventions (ECO = EFL Cup, FAC = FA Cup) so the web app
// renders them exactly like its league fixtures.
export const CUP_COMPETITIONS: ReadonlyArray<{
	name: string;
	code: string;
	headingId: string;
}> = [
	{ name: "EFL Cup", code: "ECO", headingId: "EFL_Cup" },
	{ name: "FA Cup", code: "FAC", headingId: "FA_Cup" },
];

// Wikipedia season page for Derby County. The "season" suffix must be bumped
// at the start of each season, along with the football-data season param iff
// it is ever provided to fetchFixtures. The URL must use the competition
// en-dash ("2026–27") URL-encoded as %E2%80%93.
export const DERBY_WIKI_SEASON_URL =
	"https://en.wikipedia.org/wiki/2026%E2%80%9327_Derby_County_F.C._season";
