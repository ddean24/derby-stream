import type { Fixture, FixtureScore, FixtureStatus, Team } from "@derby-streams/shared";
import {
	FIXTURE_STATUSES,
	FOOTBALL_DATA_BASE_URL,
	FOOTBALL_DATA_KEY,
	TEAM_ID,
} from "./config.ts";

interface ApiScore {
	fullTime: { home: number; away: number } | null;
}

interface ApiTeamRef {
	id: number;
	name: string;
	shortName: string;
}

interface ApiMatch {
	id: number;
	utcDate: string;
	status: string;
	competition: { name: string; code: string };
	homeTeam: ApiTeamRef;
	awayTeam: ApiTeamRef;
	score: ApiScore;
}

interface ApiMatchesResponse {
	matches: ApiMatch[];
}

const STATUS_MAP: Readonly<Record<string, FixtureStatus>> = {
	SCHEDULED: "SCHEDULED",
	TIMED: "TIMED",
	IN_PLAY: "IN_PLAY",
	PAUSED: "PAUSED",
	EXTRA_TIME: "IN_PLAY",
	PENALTY_SHOOTOUT: "IN_PLAY",
	FINISHED: "FINISHED",
	SUSPENDED: "POSTPONED",
	POSTPONED: "POSTPONED",
	CANCELLED: "CANCELLED",
	AWARDED: "FINISHED",
};

const DEFAULT_STATUS: FixtureStatus = "POSTPONED";

export interface FetchFixturesOptions {
	includeFinished?: boolean;
	season?: string;
}

export async function fetchFixtures(opts: FetchFixturesOptions = {}): Promise<Fixture[]> {
	const statuses = opts.includeFinished
		? FIXTURE_STATUSES
		: FIXTURE_STATUSES.filter((status) => status !== "FINISHED");
	const data = (await getMatchData(statuses, opts.season)) as ApiMatchesResponse;
	return data.matches.map(mapMatch).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
}

export function mapMatch(raw: unknown): Fixture {
	const match = raw as ApiMatch;
	const status = mapStatus(match.status);
	return {
		id: String(match.id),
		competition: { name: match.competition.name, code: match.competition.code },
		status,
		utcDate: match.utcDate,
		homeTeam: mapTeam(match.homeTeam),
		awayTeam: mapTeam(match.awayTeam),
		score: mapScore(match.score, status),
	};
}

async function getMatchData(statuses: readonly FixtureStatus[], season?: string): Promise<unknown> {
	const params = new URLSearchParams({ status: statuses.join(",") });
	if (season) params.set("season", season);
	const res = await fetch(
		`${FOOTBALL_DATA_BASE_URL}/teams/${TEAM_ID}/matches?${params.toString()}`,
		{ headers: { "X-Auth-Token": FOOTBALL_DATA_KEY } },
	);
	if (!res.ok) {
		throw new Error(`football-data.org returned ${res.status}: ${await res.text()}`);
	}
	return res.json();
}

function mapStatus(status: string): FixtureStatus {
	return STATUS_MAP[status] ?? DEFAULT_STATUS;
}

function mapTeam(team: ApiTeamRef): Team {
	return { id: String(team.id), name: team.name, shortName: team.shortName };
}

function mapScore(score: ApiScore, status: FixtureStatus): FixtureScore | null {
	const fullTime = score.fullTime;
	if (!fullTime) return null;
	if (status !== "FINISHED" && fullTime.home === 0 && fullTime.away === 0) return null;
	return { home: fullTime.home, away: fullTime.away };
}
