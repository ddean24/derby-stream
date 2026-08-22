/**
 * watchsports.su stream adapter.
 *
 * watchsports.su is a server-rendered site. The homepage lists every match as
 * an anchor whose `href` is a per-fixture detail route (`/football/<code>/<id>`)
 * and whose `aria-label` holds the "Home vs Away - <date> - N streams" string.
 * The actual embeds live on that detail page as external `<a class="stream-link"
 * href="https://<external-host>/...">` anchors (no iframes). This is a TWO-HOP
 * adapter:
 *
 *   hop 1 — GET the site root, find the football match anchor (`a.game-row.matchup`
 *           with an `/football/` href) whose aria-label/text matches the fixture
 *           via matchFixtureToListing;
 *   hop 2 — GET that anchor's detail page and collect every `a.stream-link[href]`
 *           (absolutised to a real external stream URL).
 *
 * Static fetches work for both hops (research-verified); no headless browser
 * needed. The adapter is defensive: a missing match or a dead detail page
 * yields nothing rather than throwing. Failures are surfaced via console.warn.
 */

import type { Fixture, StreamLink } from "@derby-streams/shared";
import { SITES } from "../config.ts";
import { fetchHtml as defaultFetchHtml, parseHtml } from "../lib/html.ts";
import { absolutise, dedupeByUrl, inferQuality, inferLanguage } from "../lib/linkExtract.ts";
import { matchFixtureToListing } from "../lib/nameMatch.ts";

export const source = "watchsports";

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
		for (const anchor of $("a.stream-link[href]").toArray()) {
			const $anchor = $(anchor);
			const url = absolutise($anchor.attr("href"), detailUrl);
			if (url === null) continue;
			// The stream-link anchors are the embeds; the visible text (e.g.
			// "SportoraLive Stream HQ en 1080p") doubles as the quality/language
			// hint, with the hostname as a fallback label.
			const text = $anchor.text().replace(/\s+/g, " ").trim();
			const hintText = `${$anchor.attr("class") ?? ""} ${text}`;
			links.push({
				url,
				source,
				label: text.length > 0 ? text : new URL(url).hostname,
				quality: inferQuality(hintText),
				language: inferLanguage(hintText),
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
	const html = await fetchPage(fetchHtml, pageUrl);
	if (html === null) return null;

	const $ = parseHtml(html);
	for (const anchor of $('a.game-row.matchup[href^="/football/"]').toArray()) {
		const $anchor = $(anchor);
		const listingText = `${$anchor.attr("aria-label") ?? ""} ${$anchor.text()}`;
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
