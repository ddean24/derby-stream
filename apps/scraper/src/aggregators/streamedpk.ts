/**
 * streamed.pk stream adapter.
 *
 * streamed.pk is a SvelteKit app that exposes its full football schedule as a
 * JSON endpoint (`/api/matches/football`) — no HTML parsing needed for the
 * listing. Each match carries a `title` (e.g. "Derby County vs Cardiff City"),
 * team names, and a `sources` array. Stream URLs live behind a per-match player
 * route `/watch/{matchId}/{source}/{streamNo}` whose static HTML contains the
 * real `<iframe src="https://embed.st/embed/...">` — so this is a TWO-HOP
 * adapter:
 *
 *   hop 1 — GET /api/matches/football (JSON), find the fixture's match object
 *           via matchFixtureToListing over its title + team names;
 *   hop 2 — for each source, GET /watch/{id}/{source}/{n} (n = 0..MAX) and pull
 *           every iframe `src` (absolutised to a real embed.st URL).
 *
 * Static fetches work for both hops (research-verified); a Cloudflare Turnstile
 * captcha appears at play time but does NOT block fetching the embed URL, which
 * is all we need. The adapter is defensive: a non-2xx/JSON page, a missing
 * match, or a dead stream number simply yields fewer/nothing — never throws.
 *
 * Failures are surfaced via console.warn so a broken source is visible in CI
 * rather than silently empty.
 */

import type { Fixture, StreamLink } from "@derby-streams/shared";
import { SITES } from "../config.ts";
import { fetchHtml as defaultFetchHtml, parseHtml } from "../lib/html.ts";
import { absolutise, dedupeByUrl } from "../lib/linkExtract.ts";
import { matchFixtureToListing } from "../lib/nameMatch.ts";

export const source = "streamedpk";

type DomApi = ReturnType<typeof parseHtml>;

export interface ScrapeFixtureOptions {
	fetchHtml?: typeof defaultFetchHtml;
}

// How many alternate stream numbers to probe per source.
const MAX_STREAMS_PER_SOURCE = 6;

interface StreamedSource {
	source: string;
	id: string;
}

interface StreamedMatch {
	id: string;
	title?: string;
	teams?: { home?: { name?: string }; away?: { name?: string } };
	sources?: StreamedSource[];
}

export async function scrapeFixture(
	fixture: Fixture,
	opts: ScrapeFixtureOptions = {},
): Promise<StreamLink[]> {
	const { fetchHtml = defaultFetchHtml } = opts;
	const pageUrls = SITES[source] ?? [];
	const links: StreamLink[] = [];

	for (const pageUrl of pageUrls) {
		const match = await findMatch(fetchHtml, pageUrl, fixture);
		if (match === null) continue;
		links.push(...(await linksForMatch(fetchHtml, pageUrl, match)));
	}

	return dedupeByUrl(links);
}

async function findMatch(
	fetchHtml: typeof defaultFetchHtml,
	pageUrl: string,
	fixture: Fixture,
): Promise<StreamedMatch | null> {
	const html = await fetchPage(fetchHtml, `${pageUrl}api/matches/football`);
	if (html === null) return null;

	let matches: unknown;
	try {
		matches = JSON.parse(html);
	} catch {
		return null;
	}
	if (!Array.isArray(matches)) return null;

	for (const candidate of matches as StreamedMatch[]) {
		const text = [candidate.title, candidate.teams?.home?.name, candidate.teams?.away?.name]
			.filter((part): part is string => typeof part === "string" && part.length > 0)
			.join(" ");
		if (matchFixtureToListing({ fixture, listingText: text })) return candidate;
	}
	return null;
}

async function linksForMatch(
	fetchHtml: typeof defaultFetchHtml,
	pageUrl: string,
	match: StreamedMatch,
): Promise<StreamLink[]> {
	const links: StreamLink[] = [];
	const sources = match.sources ?? [];

	for (const src of sources) {
		for (let n = 0; n < MAX_STREAMS_PER_SOURCE; n++) {
			const url = `${pageUrl}watch/${match.id}/${src.source}/${n}`;
			// Per-stream probes are expected to miss (a source may only expose a
			// few numbers), so don't warn on each — only the listing fetch warns.
			const html = await fetchPage(fetchHtml, url, false);
			if (html === null) continue;

			const $ = parseHtml(html);
			for (const iframe of $("iframe[src]").toArray()) {
				const streamUrl = absolutise($(iframe).attr("src"), pageUrl);
				if (streamUrl === null) continue;
				links.push({
					url: streamUrl,
					source,
					label: `${src.source} ${n + 1}`,
					quality: null,
					language: null,
				});
			}
		}
	}

	return links;
}

async function fetchPage(
	fetchHtml: typeof defaultFetchHtml,
	url: string,
	warn = true,
): Promise<string | null> {
	try {
		return await fetchHtml({ url });
	} catch (cause) {
		if (warn) {
			console.warn(`[${source}] fetch failed for ${url}: ${cause instanceof Error ? cause.message : cause}`);
		}
		return null;
	}
}
