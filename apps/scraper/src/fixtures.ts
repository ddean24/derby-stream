import type { Fixture, FixtureScore, FixtureStatus, Team } from "@derby-streams/shared";
import {
	FIXTURE_STATUSES,
	FOOTBALL_DATA_BASE_URL,
	FOOTBALL_DATA_KEY,
	TEAM_ID,
} from "./config.ts";
import {
	AuthError,
	FootballDataError,
	NetworkError,
	RATE_LIMIT_FLOOR_MS,
	RateLimitError,
} from "./errors.ts";

export type FetchFn = typeof fetch;

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

const ERROR_BODY_SNIPPET_LIMIT = 200;

export interface FetchFixturesOptions {
	includeFinished?: boolean;
	season?: string;
	fetchFn?: FetchFn;
}

export async function fetchFixtures(opts: FetchFixturesOptions = {}): Promise<Fixture[]> {
	const statuses = opts.includeFinished
		? FIXTURE_STATUSES
		: FIXTURE_STATUSES.filter((status) => status !== "FINISHED");
	const data = (await getMatchData(statuses, opts.season, opts.fetchFn)) as ApiMatchesResponse;
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

async function getMatchData(
	statuses: readonly FixtureStatus[],
	season?: string,
	fetchFn: FetchFn = fetch,
): Promise<unknown> {
	if (!FOOTBALL_DATA_KEY) {
		throw new AuthError(
			401,
			"FOOTBALL_DATA_KEY is not set; add it to your environment (e.g. .env) before querying football-data.org",
		);
	}

	const params = new URLSearchParams({ status: statuses.join(",") });
	if (season) params.set("season", season);
	const url = `${FOOTBALL_DATA_BASE_URL}/teams/${TEAM_ID}/matches?${params.toString()}`;
	const headers = { "X-Auth-Token": FOOTBALL_DATA_KEY };

	let res: Response;
	try {
		res = await fetchFn(url, { headers });
	} catch (cause) {
		throw new NetworkError(`network error while fetching fixtures from ${url}`, { cause });
	}

	if (res.ok) return res.json();

	const status = res.status;
	if (status === 401 || status === 403) {
		throw new AuthError(
			status,
			`football-data.org rejected the request (HTTP ${status}); check that FOOTBALL_DATA_KEY is a valid key`,
		);
	}
	if (status === 429) {
		const retryAfterMs = rateLimitRetryMs(res);
		throw new RateLimitError(
			status,
			retryAfterMs,
			`football-data.org rate limit exceeded (HTTP 429); retry in ${Math.round(retryAfterMs / 1000)}s`,
		);
	}

	const body = await errorBodySnippet(res);
	throw new FootballDataError(status, `football-data.org returned HTTP ${status}: ${body}`);
}

function rateLimitRetryMs(res: Response): number {
	const header = res.headers.get("X-RequestCounter-Reset");
	const resetSecs = header === null ? Number.NaN : Number(header);
	const headerMs = Number.isFinite(resetSecs) && resetSecs > 0 ? resetSecs * 1000 : RATE_LIMIT_FLOOR_MS;
	// Respect the 10 req/min free-tier window even when the header reports a shorter reset.
	return Math.max(headerMs, RATE_LIMIT_FLOOR_MS);
}

async function errorBodySnippet(res: Response): Promise<string> {
	const text = await res.text().catch(() => "");
	const trimmed = text.trim();
	if (!trimmed) return "(empty response body)";
	return trimmed.length > ERROR_BODY_SNIPPET_LIMIT
		? `${trimmed.slice(0, ERROR_BODY_SNIPPET_LIMIT)}…`
		: trimmed;
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
	if (typeof fullTime.home !== "number" || typeof fullTime.away !== "number") return null;
	if (status !== "FINISHED" && fullTime.home === 0 && fullTime.away === 0) return null;
	return { home: fullTime.home, away: fullTime.away };
}
