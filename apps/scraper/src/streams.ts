/**
 * Stream orchestrator.
 *
 * Runs every aggregator adapter for a fixture (or list of fixtures), merges
 * their stream links into a single StreamLink[], dedupes ACROSS sources by
 * URL, and (via collectStreams) persists the result to data/streams.json.
 *
 * Dedupe rule: when the same stream URL surfaces on more than one site, the
 * FIRST-SEEN entry wins. Adapters run in STREAM_SOURCES order (streamedpk,
 * vipbox), so the first source to surface a URL
 * also gets to tag it. This keeps attribution stable and deterministic
 * run-to-run; linkExtract.dedupeByUrl preserves insertion order, so feeding it
 * the links in source order is exactly the "keep first-seen" semantics.
 *
 * Adapters run SEQUENTIALLY, not concurrently (no Promise.all). The trade is
 * speed for politeness + determinism: the aggregated sites are rate-limit
 * sensitive and hammering all four at once is the kind of burst that gets a
 * scraper IP-banned. Sequential also makes the output order (and therefore
 * the first-seen dedupe winner) stable. These are I/O-bound calls, so
 * concurrent would be faster, but a fixture scrape is a handful of HTTP
 * requests — wall-clock is dominated by network latency either way, not the
 * sequential overhead.
 *
 * Isolation: each adapter runs inside its own try/catch. Per the plan's key
 * decisions, one broken site must not take the pipeline down — an unexpected
 * error logs a warning to stderr (with the source name) and the others still
 * run. An adapter returning [] is simply "nothing found" for that source.
 */

import { STREAM_SOURCES } from "@derby-streams/shared";
import type { Fixture, StreamLink, StreamSource, StreamsByFixture } from "@derby-streams/shared";
import * as aggregators from "./aggregators/index.ts";
import { appendStreamHistory, readMeta, readStreams, writeMeta, writeStreams } from "./io.ts";
import type { fetchHtml } from "./lib/html.ts";
import { dedupeByUrl } from "./lib/linkExtract.ts";

export interface ScrapeStreamsOptions {
	fixture: Fixture;
	fetchHtml?: typeof fetchHtml;
}

type AdapterScrapeFixture = (
	fixture: Fixture,
	opts?: { fetchHtml?: typeof fetchHtml },
) => Promise<StreamLink[]>;

interface StreamAdapter {
	source: StreamSource;
	scrapeFixture: AdapterScrapeFixture;
}

// Typed registry of every aggregator adapter, built explicitly from the
// aggregators barrel and keyed by StreamSource. Building it this way (rather
// than auto-driving from STREAM_SOURCES with unchecked indexing) lets TS
// enforce all four sources exist and that their source/scrapeFixture
// signatures line up — a source added to STREAM_SOURCES but not here is a
// compile error, and vice versa.
const ADAPTERS: Readonly<Record<StreamSource, StreamAdapter>> = {
	streamedpk: {
		source: aggregators.streamedpk.source,
		scrapeFixture: aggregators.streamedpk.scrapeFixture,
	},
	vipbox: {
		source: aggregators.vipbox.source,
		scrapeFixture: aggregators.vipbox.scrapeFixture,
	},
	watchsports: {
		source: aggregators.watchsports.source,
		scrapeFixture: aggregators.watchsports.scrapeFixture,
	},
};

export async function scrapeStreamsForFixture(opts: ScrapeStreamsOptions): Promise<StreamLink[]> {
	const { fixture, fetchHtml: injectedFetchHtml } = opts;
	const merged: StreamLink[] = [];

	for (const source of STREAM_SOURCES) {
		const adapter = ADAPTERS[source];
		try {
			const links = await adapter.scrapeFixture(fixture, { fetchHtml: injectedFetchHtml });
			merged.push(...links);
		} catch (cause) {
			console.error(`[streams] ${source} adapter failed, skipping source`, cause);
		}
	}

	// Cross-source dedupe: the same URL on two sites collapses to the
	// first-seen entry (see header comment). Insertion order is already
	// STREAM_SOURCES order, so first-seen == earliest source.
	return dedupeByUrl(merged);
}

// Thin multi-fixture orchestration: scrape each fixture and persist the lot to
// data/streams.json (same writer style as data/fixtures.json). Each fixture
// also gets a timestamped snapshot appended to data/stream-history.json so the
// web app can show what was live during the match (see shared type comment).
//
// Freshness metadata (data/meta.json) is written alongside so the site can
// display "data as of …" (ROADMAP.md item 8.1). The write is NON-DESTRUCTIVE
// and idempotent: scrapedAt only advances when something actually changed this
// run (a stream appeared/died, history captured a transition, or the fixture
// set changed). If streams/fixtures are byte-identical to the committed state,
// meta.json is left untouched so CI does not get a spurious git diff from an
// otherwise idle run (scrape.yml only commits when `git diff --cached` is
// non-empty). The very first run always writes meta.json.
export async function collectStreams(fixtures: Fixture[]): Promise<StreamsByFixture[]> {
	const collected: StreamsByFixture[] = [];
	let changed = false;
	for (const fixture of fixtures) {
		const links = await scrapeStreamsForFixture({ fixture });
		collected.push({ fixtureId: fixture.id, links });
		changed = appendStreamHistory({ fixtureId: fixture.id, at: new Date().toISOString(), links }) || changed;
	}

	const previousStreams = readStreams();
	const streamsChanged = JSON.stringify(previousStreams) !== JSON.stringify(collected);

	writeStreams(collected);

	const previousMeta = readMeta();
	if (
		previousMeta === null ||
		streamsChanged ||
		changed ||
		previousMeta.fixturesCount !== fixtures.length
	) {
		writeMeta({
			scrapedAt: new Date().toISOString(),
			fixturesCount: fixtures.length,
			streamsCount: collected.length,
		});
	}
	return collected;
}
