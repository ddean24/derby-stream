/**
 * totalsportek stream adapter.
 *
 * totalsportek is a "watch this match" blog/aggregator: the home page lists
 * every fixture of the day, each in its own repeating container, and the
 * stream links live inside that container. It is ad-heavy, the DOM churns,
 * and the domains rotate (totalsportek.com / .watch / .net …), so this file
 * is written to degrade gracefully rather than fail hard:
 *
 *   - the URL list lives in SITES in config.ts (single maintenance point);
 *   - every selector is isolated in the constants at the bottom of this file
 *     (single maintenance point for DOM drift);
 *   - nothing here throws on missing/malformed markup or a blocked/404 page —
 *     the worst case is an empty StreamLink[], which the orchestrator treats
 *     as "nothing found" for this source.
 *
 * ASSUMED DOM CONTRACT — to reconcile against the live site in plan item 6.3.
 * This is the structure the canned test fixture simulates:
 *
 *   <div class="match">                           <- MATCH_ROW_SELECTOR
 *     <h2>Derby County vs Blackburn Rovers</h2>   <- team names in row text
 *     <div class="links">
 *       <a class="stream-link" href="/watch/123">1080p English</a>
 *       <a class="stream-link" href="https://cdn.example.com/live/1"
 *          data-quality="HD">720p Stream</a>
 *       <a href="#">busted link</a>
 *       <a href="javascript:void(0)">another busted link</a>
 *     </div>
 *   </div>
 *   <div class="match">
 *     <h2>Preston North End vs Leeds United</h2>
 *     <div class="links">…</div>
 *   </div>
 *
 * Match detection: each row is tested with matchFixtureToListing against the
 * fixture's normalised home/away names (so "Derby" matches "Derby County",
 * dots/hyphens/FC-suffixes are ignored). Stream extraction: every candidate
 * anchor inside the matched row, with href absolutised against the page URL.
 * Quality/language are best-effort heuristics over the anchor's text + class
 * attributes; unknown values come back as null.
 */

import type { Fixture, StreamLink } from "@derby-streams/shared";
import { SITES } from "../config.ts";
import { HttpStatusError, NetworkError } from "../errors.ts";
import { fetchHtml as defaultFetchHtml, parseHtml } from "../lib/html.ts";
import {
	absolutise,
	dedupeByUrl,
	inferLanguage,
	inferQuality,
} from "../lib/linkExtract.ts";
import { matchFixtureToListing } from "../lib/nameMatch.ts";

export const source = "totalsportek";

type DomApi = ReturnType<typeof parseHtml>;
type DomElement = ReturnType<DomApi>;

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
		const html = await fetchPage(fetchHtml, pageUrl);
		if (html === null) continue;
		const $ = parseHtml(html);
		links.push(...linksFromPage($, pageUrl, fixture));
	}

	return dedupeByUrl(links);
}

async function fetchPage(
	fetchHtml: typeof defaultFetchHtml,
	url: string,
): Promise<string | null> {
	try {
		return await fetchHtml({ url });
	} catch (cause) {
		// A blocked/4xx/network page for this source is "nothing found", not an
		// error the orchestrator needs to know about.
		if (cause instanceof HttpStatusError || cause instanceof NetworkError) {
			return null;
		}
		throw cause;
	}
}

function linksFromPage($: DomApi, pageUrl: string, fixture: Fixture): StreamLink[] {
	const links: StreamLink[] = [];

	for (const row of $(MATCH_ROW_SELECTOR).toArray()) {
		const $row = $(row);
		const listingText = $row.text();
		if (!matchFixtureToListing({ fixture, listingText })) continue;
		links.push(...linksFromRow($, $row, pageUrl));
	}

	return links;
}

function linksFromRow($: DomApi, $row: DomElement, pageUrl: string): StreamLink[] {
	const links: StreamLink[] = [];

	for (const anchor of $row.find(LINK_ROW_SELECTOR).toArray()) {
		const $anchor = $(anchor);
		const url = absolutise($anchor.attr("href"), pageUrl);
		if (url === null) continue;

		const label = $anchor.text().trim();
		if (!label) continue;

		const hintText = `${$anchor.attr("class") ?? ""} ${label}`;
		links.push({
			url,
			source,
			label,
			quality: inferQuality(hintText),
			language: inferLanguage(hintText),
		});
	}

	return links;
}

// Resolves an anchor href to an absolute URL; infers quality/language and
// dedupes by URL — see ../lib/linkExtract.ts.

// --- Selectors (single maintenance point for DOM drift) ---

// The smallest repeating element that holds one match's team names + links.
const MATCH_ROW_SELECTOR = ".match, .match-row, .match-card";

// Candidate stream anchors scoped to inside a match row. `.stream-link` is the
// primary class; `.links a[href]` / `.match-links a[href]` are structural
// fallbacks for when the class drifts.
const LINK_ROW_SELECTOR = ".stream-link, .links a[href], .match-links a[href]";
