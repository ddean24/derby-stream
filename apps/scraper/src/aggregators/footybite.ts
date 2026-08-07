/**
 * footybite.to stream adapter.
 *
 * footybite is a table/grid aggregator: the home page lists every fixture of
 * the day, one row per match, and each row packs the stream links as multiple
 * anchor cells (typically one per listed source/channel) with the team names
 * elsewhere in the row. It is a single mostly-server-rendered page (some JS),
 * so this adapter is ONE-HOP like totalsportek:
 *
 *   fetch SITES[source] -> find the fixture's row via matchFixtureToListing ->
 *   extract every stream anchor inside that row.
 *
 * Same defensive posture as the other adapters:
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
 *   <table class="match-list">              <- listing container (not matched)
 *     <tbody>
 *       <tr class="match-row">              <- MATCH_ROW_SELECTOR (tr first)
 *         <td class="match-teams">Derby County vs XYZ FC</td>
 *         <td class="match-links">
 *           <a class="stream-link" href="/stream/123">1080p English</a>
 *           <a class="stream-link" href="https://cdn.example.com/live/1">HD</a>
 *           <a href="#">busted link</a>
 *           <a href="javascript:void(0)">busted link</a>
 *         </td>
 *       </tr>
 *       <tr class="match-row">
 *         <td class="match-teams">Preston North End vs Leeds United</td>
 *         <td class="match-links">…</td>
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * Two footybite realities to design around:
 *   - rows can be grid `<div class="match-card">` blocks instead of `<tr>`;
 *     the row selector covers both;
 *   - some rows hide their links behind a single "watch" anchor whose href is
 *     real. Because extraction is row-scoped, that anchor is still captured by
 *     the broad row `a[href]` fallback.
 *
 * Match detection: each row is tested with matchFixtureToListing against the
 * fixture's normalised home/away names (so "Derby" matches "Derby County",
 * dots/hyphens/FC-suffixes are ignored). Stream extraction: every anchor
 * inside the matched row, href absolutised against the page URL (junk hrefs —
 * "#", "javascript:", "mailto:" — are rejected by absolutise). If the DOM pass
 * finds nothing, a <script> JSON scan (mirroring soccerstreams' defensive
 * pass) looks for stream URLs within a window of the fixture's team tokens.
 * Quality/language are best-effort heuristics over anchor text + class
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
import { matchFixtureToListing, normaliseFixtureTeamNames } from "../lib/nameMatch.ts";

export const source = "footybite";

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

	if (links.length > 0) return links;
	// JS-shell fallback (mirrors soccerstreams): when the row anchors are
	// JS-rendered, scrape stream URLs from the embedded <script> JSON instead.
	return streamLinksFromScript($(SCRIPT_SELECTOR).text(), pageUrl, fixture);
}

function linksFromRow($: DomApi, $row: DomElement, pageUrl: string): StreamLink[] {
	const links: StreamLink[] = [];

	for (const anchor of $row.find(LINK_ROW_SELECTOR).toArray()) {
		const $anchor = $(anchor);
		const url = absolutise($anchor.attr("href"), pageUrl);
		if (url === null || url === pageUrl) continue;
		if (hasFragment(url)) continue;

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

// Script fallback for a JS-rendered listing: the whole day's matches are
// embedded in one <script> blob, so a stream URL only counts when it sits
// within a window of the fixture's normalised team tokens (avoids bleeding
// into neighbouring matches). Labels resolve via nearest-label matching;
// quality/language come from a tight text window around each URL.
function streamLinksFromScript(
	scriptText: string,
	pageUrl: string,
	fixture: Fixture,
): StreamLink[] {
	const { home, away } = normaliseFixtureTeamNames(fixture);
	const tokens = [...new Set([home, away])].filter((token) => token.length > 0);
	const tokenHits = tokenHitIndexes(scriptText, tokens);
	if (tokenHits.length === 0) return [];

	const links: StreamLink[] = [];

	for (const match of scriptText.matchAll(QUOTED_STRING_RE)) {
		const raw = match[1];
		const index = match.index;
		if (raw === undefined || index === undefined) continue;
		// Bare JSON keys ("url", "label") are not streams. Only accept
		// scheme'd or path-prefixed strings.
		if (!/^(?:https?:)?\/\//i.test(raw) && !raw.startsWith("/")) continue;
		const url = absolutise(raw, pageUrl);
		if (url === null || url === pageUrl) continue;
		if (hasFragment(url)) continue;
		if (!isStreamCandidate(url)) continue;
		if (nearestTokenDistance(tokenHits, index) > SCRIPT_FIXTURE_WINDOW) continue;

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

// Stream links inside the <script> JSON are either route-prefixed paths
// (/stream/…, /live/…) or absolute http(s) URLs pointing at a real host. A
// bare slug or a bare JSON key name ("url", "label") is NOT a stream.
const STREAM_ROUTE_RE = /^\/(?:stream|live|embed|watch|play|go)\//i;
const VS_SLUG_RE = /\/[a-z0-9]+(?:-[a-z0-9]+)*-vs-[a-z0-9]+(?:-[a-z0-9]+)*/i;

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

function tokenHitIndexes(text: string, tokens: readonly string[]): number[] {
	const hits: number[] = [];
	for (const token of tokens) {
		const lower = token.toLowerCase();
		let fromIndex = 0;
		for (;;) {
			const hit = text.toLowerCase().indexOf(lower, fromIndex);
			if (hit === -1) break;
			hits.push(hit);
			fromIndex = hit + lower.length;
		}
	}
	return hits;
}

function nearestTokenDistance(hits: readonly number[], index: number): number {
	let best = Number.POSITIVE_INFINITY;
	for (const hit of hits) {
		const dist = Math.abs(hit - index);
		if (dist < best) best = dist;
	}
	return best;
}

// JSON keys that commonly carry a stream's display name. A channel object
// usually declares its label before its url, so the label that best matches a
// stream URL is the closest one preceding it (falling back to the closest
// following label).
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

// The smallest repeating element that holds one match's team names + links.
// footybite is table-based, so `tr` comes first; grid cards are the fallback.
const MATCH_ROW_SELECTOR = "tr, .match, .match-row, .match-card, li";

// Candidate stream anchors scoped to inside a match row. Classed cell/link
// selectors first, then a bare `a[href]` fallback — a row-scoped anchor is
// almost always a stream cell or the real-href "watch" button.
const LINK_ROW_SELECTOR =
	".stream-link, .link-cell a[href], .match-links a[href], .links a[href], a[href]";

// <script> blocks where a JS-rendered page embeds its data.
const SCRIPT_SELECTOR = "script";

// Only stream URLs this close to a fixture team token belong to this match.
const SCRIPT_FIXTURE_WINDOW = 600;

// Tight context around a script-embedded stream URL, used only for the
// quality/language heuristics. Labels are resolved separately (nearest-label
// matching) because a fixed window bleeds into neighbouring channels in
// compact JSON.
const STREAM_CONTEXT_BEFORE = 60;
const STREAM_CONTEXT_AFTER = 40;

// Quoted strings inside script text (incl. template literals).
const QUOTED_STRING_RE = /["'`]([^"'`\s]{2,})["'`]/g;
