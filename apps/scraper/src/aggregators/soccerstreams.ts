/**
 * soccerstreams.net stream adapter.
 *
 * soccerstreams.net is a React app: the home/fixtures page is JS-rendered and
 * is light on real hrefs, while the actual stream links live on a per-match
 * page whose URL carries the match slug/id. This adapter is therefore
 * TWO-HOP:
 *
 *   hop 1 — fetch SITES[source] (the listing page), find the Derby match link
 *           via matchFixtureToListing, and extract the match page URL;
 *   hop 2 — fetch that match page and pull its stream anchors.
 *
 * Because the listing may come back as a bare JS shell with the fixture data
 * embedded in a <script> JSON blob (a `window.__INITIAL_STATE__` assignment or
 * a `<script type="application/json">` block), hop 1 is deliberately
 * defensive, in this order:
 *
 *   1. cheerio pass — scan every anchor whose href looks like a match page
 *      route (/watch/…, /live/…, or a "-vs-" slug) and test the anchor's text
 *      plus its surrounding row text against the fixture;
 *   2. script pass (only if the DOM pass found nothing) — locate the fixture's
 *      normalised team tokens inside <script> text and pull the nearest
 *      plausible match-page URL from the surrounding window.
 *
 * Hop 2 follows the same pattern: cheerio anchors on the match page first; if
 * none survive, a <script> scan for stream URLs.
 *
 * Nothing here throws on missing/malformed markup or a blocked/404 page — the
 * worst case is an empty StreamLink[], which the orchestrator treats as
 * "nothing found" for this source.
 *
 * ASSUMED DOM CONTRACT — to reconcile against the live site in plan item 6.3.
 * This is the structure the canned test fixtures simulate:
 *
 * Listing page (hop 1):
 *
 *   <div class="match-list">
 *     <div class="match-row">
 *       <a href="/watch/derby-county-vs-xyz-fc">Derby County vs XYZ FC</a>
 *     </div>
 *     <div class="match-row">
 *       <a href="/watch/preston-north-end-vs-leeds-united">
 *         Preston North End vs Leeds United</a>
 *     </div>
 *   </div>
 *
 * …or, when JS-rendered, a script blob in place of the anchors:
 *
 *   <script type="application/json">
 *     {"matches":[{"home":"Derby County","away":"XYZ FC",
 *                  "url":"/watch/derby-county-vs-xyz-fc"}]}
 *   </script>
 *
 * Match page (hop 2):
 *
 *   <div class="channels">
 *     <a class="stream-link" href="/stream/abc123">1080p English</a>
 *     <a class="stream-link" href="https://cdn.example.com/live/1">720p</a>
 *     <a href="javascript:void(0)">busted link</a>
 *   </div>
 *
 * Match detection reuses matchFixtureToListing so "Derby" matches
 * "Derby County" and dots/hyphens/FC-suffixes are ignored. Quality/language
 * are best-effort heuristics over anchor text + class attributes; unknown
 * values come back as null.
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
import { matchFixtureToListing, normaliseFixtureTeamNames } from "../lib/nameMatch.ts";

export const source = "soccerstreams";

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
		const matchPageUrl = await findMatchPageUrl(fetchHtml, pageUrl, fixture);
		if (matchPageUrl === null) continue;
		const html = await fetchPage(fetchHtml, matchPageUrl);
		if (html === null) continue;
		const $ = parseHtml(html);
		links.push(...linksFromMatchPage($, matchPageUrl));
	}

	return dedupeByUrl(links);
}

async function findMatchPageUrl(
	fetchHtml: typeof defaultFetchHtml,
	pageUrl: string,
	fixture: Fixture,
): Promise<string | null> {
	const html = await fetchPage(fetchHtml, pageUrl);
	if (html === null) return null;
	const $ = parseHtml(html);
	return matchPageUrlFromListing($, pageUrl, fixture);
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

// Hop 1: locate the fixture's match page on the listing. DOM anchors first,
// then a <script> scan for the JS-shell case.
function matchPageUrlFromListing($: DomApi, pageUrl: string, fixture: Fixture): string | null {
	const domUrl = matchPageUrlFromDom($, pageUrl, fixture);
	if (domUrl !== null) return domUrl;
	return matchPageUrlFromScript($(SCRIPT_SELECTOR).text(), pageUrl, fixture);
}

function matchPageUrlFromDom($: DomApi, pageUrl: string, fixture: Fixture): string | null {
	for (const anchor of $(LISTING_LINK_SELECTOR).toArray()) {
		const $anchor = $(anchor);
		const url = absolutise($anchor.attr("href"), pageUrl);
		if (url === null || matchPathPriority(url) === 0) continue;

		// The anchor text is often the full "Derby County vs XYZ FC" title; the
		// surrounding row text covers cases where the anchor is a terse icon or
		// button and the team names sit elsewhere in the row.
		const anchorText = $anchor.text();
		const rowText = $anchor.closest(ROW_CONTAINER_SELECTOR).text();
		if (!matchFixtureToListing({ fixture, listingText: `${anchorText} ${rowText}` })) {
			continue;
		}
		return url;
	}
	return null;
}

// JS-shell fallback: the fixture data lives inside a <script> blob. Find the
// fixture's normalised team tokens (hyphenated slug forms and spaced forms) in
// the script text and return the highest-priority match-page URL nearest to a
// token hit. The "nearest" tie-break matters: a JS-rendered listing embeds
// every match's data in the same blob, and a fixed window can bleed into a
// neighbouring match's URL.
function matchPageUrlFromScript(scriptText: string, pageUrl: string, fixture: Fixture): string | null {
	const { home, away } = normaliseFixtureTeamNames(fixture);
	const tokens = [...new Set([slugify(home), slugify(away), home, away])].filter(
		(token) => token.length > 0,
	);
	const quoted = quotedStrings(scriptText);

	for (const token of tokens) {
		const lowerToken = token.toLowerCase();
		let fromIndex = 0;
		for (;;) {
			const hit = scriptText.toLowerCase().indexOf(lowerToken, fromIndex);
			if (hit === -1) break;
			const url = bestMatchUrlNear(quoted, hit, pageUrl);
			if (url !== null) return url;
			fromIndex = hit + lowerToken.length;
		}
	}
	return null;
}

function bestMatchUrlNear(
	quoted: ReadonlyArray<{ value: string; index: number }>,
	index: number,
	pageUrl: string,
): string | null {
	const sorted = [...quoted].sort(
		(a, b) => Math.abs(a.index - index) - Math.abs(b.index - index),
	);
	for (const entry of sorted) {
		const url = absolutise(entry.value, pageUrl);
		if (url === null) continue;
		if (matchPathPriority(url) > 0) return url;
	}
	return null;
}

// Hop 2: extract stream links from the match page. DOM anchors first; if none
// survive the junk filter, fall back to a <script> scan for stream URLs.
function linksFromMatchPage($: DomApi, matchPageUrl: string): StreamLink[] {
	const domLinks = streamLinksFromDom($, matchPageUrl);
	if (domLinks.length > 0) return domLinks;
	return streamLinksFromScript($(SCRIPT_SELECTOR).text(), matchPageUrl);
}

function streamLinksFromDom($: DomApi, pageUrl: string): StreamLink[] {
	const links: StreamLink[] = [];

	for (const anchor of $(MATCH_PAGE_LINK_SELECTOR).toArray()) {
		const $anchor = $(anchor);
		const url = absolutise($anchor.attr("href"), pageUrl);
		if (url === null || url === pageUrl) continue;
		if (hasFragment(url)) continue;
		if (isStaticAsset(url)) continue;

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

// Script fallback for a fully JS-rendered match page: collect plausible stream
// URLs embedded in <script> JSON. Labels are resolved by nearest-label matching;
// quality/language come from a tight text window around each URL; a generic
// "stream" label is the last resort.
function streamLinksFromScript(scriptText: string, pageUrl: string): StreamLink[] {
	const links: StreamLink[] = [];

	for (const match of scriptText.matchAll(QUOTED_STRING_RE)) {
		const raw = match[1];
		if (raw === undefined) continue;
		// Bare JSON keys ("url", "label") are not streams. Only accept
		// scheme'd or path-prefixed strings, otherwise a bare word would
		// resolve against the match-page path (e.g. -> /watch/url) and pass
		// the stream-route check below.
		if (!/^(?:https?:)?\/\//i.test(raw) && !raw.startsWith("/")) continue;
		const url = absolutise(raw, pageUrl);
		if (url === null || url === pageUrl) continue;
		if (hasFragment(url)) continue;
		if (!isStreamCandidate(url)) continue;

		const index = match.index ?? 0;
		const start = Math.max(0, index - STREAM_CONTEXT_BEFORE);
		const end = Math.min(scriptText.length, index + STREAM_CONTEXT_AFTER);
		const hintText = scriptText.slice(start, end);

		links.push({
			url,
			source,
			label: nearestStreamLabel(scriptText, index) ?? "stream",
			quality: inferQuality(hintText),
			language: inferLanguage(hintText),
		});
	}

	return links;
}

// --- URL classification helpers ---

// Match-page routes look like /watch/<slug>. Paths carrying a "-vs-" slug
// ("/derby-county-vs-xyz-fc") are the second-best signal (e.g. a bare slug
// string in the JSON). Priority 2 > 1 > 0.
const MATCH_ROUTE_RE = /^\/(?:watch|live|event|match|stream)\//i;
const VS_SLUG_RE = /\/[a-z0-9]+(?:-[a-z0-9]+)*-vs-[a-z0-9]+(?:-[a-z0-9]+)*/i;

function matchPathPriority(url: string): number {
	let pathname: string;
	try {
		pathname = new URL(url).pathname;
	} catch {
		return 0;
	}
	if (MATCH_ROUTE_RE.test(pathname)) return 2;
	if (VS_SLUG_RE.test(pathname)) return 1;
	return 0;
}

// Stream links inside a match page's JSON are either route-prefixed paths
// (/stream/…, /live/…) or absolute http(s) URLs pointing at a real host. A
// bare slug or a bare JSON key name ("url", "label") is NOT a stream.
const STREAM_ROUTE_RE = /^\/(?:stream|live|embed|watch|play|go)\//i;

function isStreamCandidate(url: string): boolean {
	let pathname: string;
	try {
		pathname = new URL(url).pathname;
	} catch {
		return false;
	}
	if (STREAM_ROUTE_RE.test(pathname)) return true;
	if (!/^https?:\/\//i.test(url)) return false;
	if (VS_SLUG_RE.test(pathname)) return false;
	if (isStaticAsset(url)) return false;
	const segments = pathname.split("/").filter((segment) => segment.length > 0);
	// A real stream URL has either a second path segment (/live/1) or a dotted
	// host (cdn.example.com); a single bare word ("/url", "/label") is a JSON
	// key, not a stream.
	return segments.length >= 2 || pathname.includes(".");
}

// Non-stream static assets (scripts, styles, images) that commonly appear in
// JSON state blobs.
const STATIC_ASSET_RE = /\.(?:css|js|png|jpe?g|gif|svg|webp|woff2?|ttf|ico|json|xml|map)(?:$|[?#])/i;

function isStaticAsset(url: string): boolean {
	return STATIC_ASSET_RE.test(url);
}

// Same-page anchors ("#top", "…/stream/1#xyz") are navigation, not streams.
function hasFragment(url: string): boolean {
	try {
		return new URL(url).hash !== "";
	} catch {
		return false;
	}
}

// --- Script context helpers ---

function slugify(name: string): string {
	return name.replace(/\s+/g, "-");
}

// Every quoted string inside script text, with its offset. Used to locate the
// quoted value nearest a team-token hit (see matchPageUrlFromScript).
function quotedStrings(
	text: string,
): ReadonlyArray<{ value: string; index: number }> {
	const out: Array<{ value: string; index: number }> = [];
	for (const match of text.matchAll(QUOTED_STRING_RE)) {
		const value = match[1];
		const index = match.index;
		if (value !== undefined && index !== undefined) {
			out.push({ value, index });
		}
	}
	return out;
}

// JSON keys that commonly carry a stream's display name. A channel object
// usually declares its label before its url, so the label that best matches a
// stream URL is the closest one preceding it (falling back to the closest
// following label). A fixed context window can't do this reliably — compact
// JSON puts a neighbouring channel's fields within a few dozen chars.
const STREAM_LABEL_GLOBAL_RE = /["'](?:label|title|name|channel)["']\s*:\s*["']([^"']+)["']/gi;
const STREAM_LABEL_MAX_DIST = 200;

function nearestStreamLabel(scriptText: string, urlIndex: number): string | null {
	let bestPreceding: { dist: number; label: string } | null = null;
	let bestFollowing: { dist: number; label: string } | null = null;

	for (const match of scriptText.matchAll(STREAM_LABEL_GLOBAL_RE)) {
		const label = match[1]?.trim();
		if (label === undefined || label.length === 0) continue;
		const matchIndex = match.index ?? 0;
		const dist = Math.abs(matchIndex - urlIndex);
		if (dist > STREAM_LABEL_MAX_DIST) continue;

		const candidate = { dist, label };
		if (matchIndex < urlIndex) {
			if (bestPreceding === null || dist < bestPreceding.dist) bestPreceding = candidate;
		} else if (bestFollowing === null || dist < bestFollowing.dist) {
			bestFollowing = candidate;
		}
	}

	return bestPreceding?.label ?? bestFollowing?.label ?? null;
}

// --- Selectors & constants (single maintenance point for DOM drift) ---

// Hop 1: every anchor on the listing is a candidate match-page link; the path
// check + matchFixtureToListing do the filtering.
const LISTING_LINK_SELECTOR = "a[href]";

// Ancestors used to gather row-context text when the anchor itself is terse.
const ROW_CONTAINER_SELECTOR = ".match, .match-row, .match-card, li, tr";

// Hop 2: stream anchors on a match page. `.channel a[href]` / `.stream a[href]`
// match soccerstreams' channel-list structure; the rest are totalsportek-style
// fallbacks.
const MATCH_PAGE_LINK_SELECTOR =
	".channel a[href], .stream a[href], .stream-link, .links a[href], .channels a[href]";

// <script> blocks where a JS-rendered page embeds its data.
const SCRIPT_SELECTOR = "script";

// Tight context around a script-embedded stream URL, used only for the
// quality/language heuristics. Labels are resolved separately (nearest-label
// matching) because a fixed window bleeds into neighbouring channels in
// compact JSON.
const STREAM_CONTEXT_BEFORE = 60;
const STREAM_CONTEXT_AFTER = 40;

// Quoted strings inside script text. Re-used (safely, matchAll clones the
// regex) by both the hop-1 slug scan and the hop-2 stream scan.
const QUOTED_STRING_RE = /["'`]([^"'`\s]{2,})["'`]/g;
