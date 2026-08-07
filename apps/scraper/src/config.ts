import type { FixtureStatus } from "@derby-streams/shared";

export const TEAM_ID = 342; // Derby County FC on football-data.org — see research/team-id.md (345 is Sheffield Wednesday)

export const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";

export const FOOTBALL_DATA_KEY: string = process.env.FOOTBALL_DATA_KEY ?? "";

export const FIXTURE_STATUSES: readonly FixtureStatus[] = [
	"SCHEDULED",
	"TIMED",
	"IN_PLAY",
	"PAUSED",
	"FINISHED",
];
