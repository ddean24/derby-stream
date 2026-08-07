import type { FixtureStatus, StreamSource } from "@derby-streams/shared";

export const TEAM_ID = 342; // Derby County FC on football-data.org — see research/team-id.md (345 is Sheffield Wednesday)

export const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";

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
