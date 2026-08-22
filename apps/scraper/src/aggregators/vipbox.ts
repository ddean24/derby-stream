/**
 * vipbox.fm stream adapter.
 *
 * vipbox.fm is a server-rendered site: the schedule page `/football-live` lists
 * every football match as an anchor whose `href` ends in `-streams`
 * (e.g. `/football/lincoln-city-vs-portsmouth-streams`) and whose text/title
 * holds the "Home vs Away" fixture name. The actual embeds live on that detail
 * page as multiple `<iframe src="//host/path">` (protocol-relative, external
 * CDN hosts). This is a TWO-HOP adapter:
 *
 *   hop 1 — GET /football-live, find the anchor matching the fixture via
 *           matchFixtureToListing over its text + title;
 *   hop 2 — GET that anchor's href and collect every iframe `src`, absolutised
 *           to https.
 *
 * Static fetches work for both hops (research-verified); no headless browser
 * needed. The adapter is defensive: a missing match or a dead detail page
 * yields nothing rather than throwing. Failures are surfaced via console.warn.
 */

import type { Fixture, StreamLink } from "@derby-streams/shared";
import { SITES } from "../config.ts";
import { fetchHtml as defaultFetchHtml, parseHtml } from "../lib/html.ts";
import { absolutise, dedupeByUrl } from "../lib/linkExtract.ts";
import { matchFixtureToListing } from "../lib/nameMatch.ts";

export const source = "vipbox";

type DomApi = ReturnType<typeof parseHtml>;

export interface ScrapeFixtureOptions {
	fetchHtml?: typeof defaultFetchHtml;
}

export async function scrapeFixture(
	fixture: Fixture,
	opts: ScrapeFixtureOptions = {},
): Promise<StreamLink[]> {
	const { fetchHtml = defaultFetchHtml } = opts;
	const pageUrls = SITES[source] ?? [];
	const links: StreamLink[] = [];

	for (const pageUrl of pageUrls) {
		const matchHref = await findMatchHref(fetchHtml, pageUrl, fixture);
		if (matchHref === null) continue;

		const detailUrl = absolutise(matchHref, pageUrl) ?? matchHref;
		const html = await fetchPage(fetchHtml, detailUrl);
		if (html === null) continue;

		const $ = parseHtml(html);
		for (const iframe of $("iframe[src]").toArray()) {
			const streamUrl = absolutise($(iframe).attr("src"), detailUrl);
			if (streamUrl === null) continue;
			links.push({
				url: streamUrl,
				source,
				label: "Stream",
				quality: null,
				language: null,
			});
		}
	}

	return dedupeByUrl(links);
}

async function findMatchHref(
	fetchHtml: typeof defaultFetchHtml,
	pageUrl: string,
	fixture: Fixture,
): Promise<string | null> {
	const html = await fetchPage(fetchHtml, `${pageUrl}football-live`);
	if (html === null) return null;

	const $ = parseHtml(html);
	for (const anchor of $('a[href^="/football/"][href$="-streams"]').toArray()) {
		const $anchor = $(anchor);
		const listingText = `${$anchor.text()} ${$anchor.attr("title") ?? ""}`;
		if (matchFixtureToListing({ fixture, listingText })) {
			return $anchor.attr("href") ?? null;
		}
	}
	return null;
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
