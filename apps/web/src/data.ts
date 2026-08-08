import type { DataFiles, Fixture, StreamLink, StreamsByFixture } from "@derby-streams/shared";

export class DataError extends Error {
	readonly status: number | null;

	constructor(message: string, status: number | null = null) {
		super(message);
		this.name = "DataError";
		this.status = status;
	}
}

export interface FetchDataOptions {
	signal?: AbortSignal;
}

const FIXTURES_URL = "data/fixtures.json";
const STREAMS_URL = "data/streams.json";

async function fetchJson(url: string, opts?: FetchDataOptions): Promise<unknown> {
	const res = await fetch(url, { signal: opts?.signal });
	if (!res.ok) {
		throw new DataError(`Failed to fetch "${url}" (${res.status} ${res.statusText})`, res.status);
	}
	return (await res.json()) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isTeam(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return isString(value.id) && isString(value.name) && isString(value.shortName);
}

function isFixture(value: unknown): value is Fixture {
	if (!isRecord(value)) return false;
	if (!isRecord(value.competition)) return false;
	const competition = value.competition;
	if (!isString(competition.name) || !isString(competition.code)) return false;
	const scoreOk =
		value.score === null ||
		(isRecord(value.score) &&
			(value.score.home === null || typeof value.score.home === "number") &&
			(value.score.away === null || typeof value.score.away === "number"));
	return (
		isString(value.id) &&
		isString(value.status) &&
		isString(value.utcDate) &&
		isTeam(value.homeTeam) &&
		isTeam(value.awayTeam) &&
		scoreOk
	);
}

function isFixtureArray(value: unknown): value is Fixture[] {
	if (!Array.isArray(value)) return false;
	for (const item of value) {
		if (!isFixture(item)) return false;
	}
	return true;
}

function isStreamLink(value: unknown): value is StreamLink {
	if (!isRecord(value)) return false;
	return (
		isString(value.url) &&
		isString(value.source) &&
		isString(value.label) &&
		(value.quality === null || isString(value.quality)) &&
		(value.language === null || isString(value.language))
	);
}

function isStreamsByFixture(value: unknown): value is StreamsByFixture {
	if (!isRecord(value)) return false;
	if (!isString(value.fixtureId)) return false;
	if (!Array.isArray(value.links)) return false;
	return value.links.every((link: unknown) => isStreamLink(link));
}

function isStreamsByFixtureArray(value: unknown): value is StreamsByFixture[] {
	if (!Array.isArray(value)) return false;
	for (const item of value) {
		if (!isStreamsByFixture(item)) return false;
	}
	return true;
}

export async function fetchFixtures(opts?: FetchDataOptions): Promise<Fixture[]> {
	const data = await fetchJson(FIXTURES_URL, opts);
	if (!isFixtureArray(data)) {
		throw new DataError("Invalid fixtures data: expected an array of fixtures");
	}
	return data;
}

export async function fetchStreams(opts?: FetchDataOptions): Promise<StreamsByFixture[]> {
	const data = await fetchJson(STREAMS_URL, opts);
	if (!isStreamsByFixtureArray(data)) {
		throw new DataError("Invalid streams data: expected an array of stream entries");
	}
	return data;
}

export async function fetchData(opts?: FetchDataOptions): Promise<DataFiles> {
	const [fixtures, streams] = await Promise.all([fetchFixtures(opts), fetchStreams(opts)]);
	return { fixtures, streams };
}

export function streamsForFixture(streams: StreamsByFixture[], fixtureId: string): StreamLink[] {
	const entry = streams.find((stream) => stream.fixtureId === fixtureId);
	return entry?.links ?? [];
}
