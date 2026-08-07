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

export interface DataFiles {
	fixtures: Fixture[];
	streams: StreamsByFixture[];
}
