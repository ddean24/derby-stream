export const STREAM_SOURCES = ["totalsportek", "soccerstreams", "footybite", "hesgoal"] as const;

export type StreamSource = (typeof STREAM_SOURCES)[number];

export interface StreamLink {
	url: string;
	source: StreamSource;
	label: string;
	quality: string | null;
	language: string | null;
}

export type FixtureStatus =
	| "SCHEDULED"
	| "TIMED"
	| "IN_PLAY"
	| "PAUSED"
	| "FINISHED"
	| "CANCELLED"
	| "POSTPONED";

export interface Team {
	id: string;
	name: string;
	shortName: string;
}

export interface FixtureScore {
	home: number;
	away: number;
}

export interface Fixture {
	id: string;
	competition: {
		name: string;
		code: string;
	};
	status: FixtureStatus;
	utcDate: string;
	homeTeam: Team;
	awayTeam: Team;
	score: FixtureScore | null;
}

export interface StreamsByFixture {
	fixtureId: string;
	links: StreamLink[];
}

// One archived snapshot of a fixture's streams. `at` is the moment the
// collector captured these links (ISO-8601 UTC). The scraper appends an entry
// for the target fixture on every run and skips an identical repetition, so a
// fixture's history is a timeline of distinct stream states — enough to replay
// what was available during the match and spot links that later died
// (PLAN.md item 7.6). Committed alongside fixtures/streams.
export interface StreamHistoryEntry {
	fixtureId: string;
	at: string;
	links: StreamLink[];
}

export interface DataFiles {
	fixtures: Fixture[];
	streams: StreamsByFixture[];
}

// Freshness metadata written by the scraper alongside fixtures/streams so the
// static site can show "data as of …" (ROADMAP.md item 8.1).
export interface ScrapeMeta {
	scrapedAt: string;
	fixturesCount: number;
	streamsCount: number;
}
