import type {
	DataFiles,
	Fixture,
	ScrapeMeta,
	StreamHistoryEntry,
	StreamLink,
	StreamsByFixture,
} from "@derby-streams/shared";

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
const STREAM_HISTORY_URL = "data/stream-history.json";
const META_URL = "data/meta.json";

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

function isStreamHistoryEntry(value: unknown): value is StreamHistoryEntry {
	if (!isRecord(value)) return false;
	if (!isString(value.fixtureId) || !isString(value.at)) return false;
	if (!Array.isArray(value.links)) return false;
	return value.links.every((link: unknown) => isStreamLink(link));
}

function isStreamHistoryEntryArray(value: unknown): value is StreamHistoryEntry[] {
	if (!Array.isArray(value)) return false;
	for (const item of value) {
		if (!isStreamHistoryEntry(item)) return false;
	}
	return true;
}

function isScrapeMeta(value: unknown): value is ScrapeMeta {
	if (!isRecord(value)) return false;
	return (
		isString(value.scrapedAt) &&
		typeof value.fixturesCount === "number" &&
		typeof value.streamsCount === "number"
	);
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

export interface HistoryFetchResult {
	history: StreamHistoryEntry[];
	// true when data/stream-history.json is committed at all; lets callers
	// distinguish "history exists but this match.had none" from "no history yet".
	isPresent: boolean;
}

export async function fetchStreamHistory(opts?: FetchDataOptions): Promise<HistoryFetchResult> {
	const data = await fetchJson(STREAM_HISTORY_URL, opts);
	if (!isStreamHistoryEntryArray(data)) {
		throw new DataError("Invalid stream history data: expected an array of history entries");
	}
	return { history: data, isPresent: true };
}

export async function fetchStreamHistoryOrNull(
	opts?: FetchDataOptions,
): Promise<HistoryFetchResult | null> {
	try {
		return await fetchStreamHistory(opts);
	} catch (err) {
		// The history file is written by the scraper and may not exist yet in
		// the committed data (e.g. before a live match becomes scrapable). A
		// missing snapshot is fine — the UI just shows nothing under history.
		if (err instanceof DataError && err.status !== null) {
			// An HTTP error (like 404 when the file is absent) means "no history".
			return null;
		}
		throw err;
	}
}

export async function fetchMeta(opts?: FetchDataOptions): Promise<ScrapeMeta> {
	const data = await fetchJson(META_URL, opts);
	if (!isScrapeMeta(data)) {
		throw new DataError("Invalid meta data: expected ScrapeMeta");
	}
	return data;
}

// The meta file only exists once the scraper has run; before that a 404 is
// expected and returns null rather than failing the whole load.
export async function fetchMetaOrNull(opts?: FetchDataOptions): Promise<ScrapeMeta | null> {
	try {
		return await fetchMeta(opts);
	} catch (err) {
		if (err instanceof DataError && err.status !== null) {
			return null;
		}
		throw err;
	}
}

export async function fetchData(opts?: FetchDataOptions): Promise<DataFiles> {
	const [fixtures, streams] = await Promise.all([fetchFixtures(opts), fetchStreams(opts)]);
	return { fixtures, streams };
}

export function streamsForFixture(streams: StreamsByFixture[], fixtureId: string): StreamLink[] {
	const entry = streams.find((stream) => stream.fixtureId === fixtureId);
	return entry?.links ?? [];
}
