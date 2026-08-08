/**
 * Offline smoke tests for the stream adapters.
 *
 * PLAN.md item 6.3 (real matchday smoke test) can only run while a Derby game
 * is actually live — the aggregator sites only list fixtures of the day. These
 * tests fill that gap: they feed each adapter canned HTML that matches the
 * ASSUMED DOM CONTRACT documented in the adapter's header comment, and drive
 * the full pipeline (scrapeStreamsForFixture) so parsing, extraction,
 * dedupe/merge, and per-source isolation are all exercised WITHOUT a live game.
 *
 * What they cannot verify is the real DOM of the aggregator sites — that still
 * needs the live-matchday smoke test. See PLAN.md item 6.3.
 */

import { describe, expect, test } from "bun:test";
import type { Fixture, StreamLink, StreamSource } from "@derby-streams/shared";
import { SITES } from "../src/config.ts";
import { HttpStatusError, NetworkError } from "../src/errors.ts";
import type { FetchHtmlOptions } from "../src/lib/html.ts";
import { scrapeStreamsForFixture } from "../src/streams.ts";

// ---------------------------------------------------------------------------
// Canned pages — each matches the ASSUMED DOM CONTRACT in the adapter's header
// comment (totalsportek.ts:17, soccerstreams.ts:32, footybite.ts:21,
// hesgoal.ts:28). The soccerstreams listing links to a per-match page (two
// hops), so the routes object has to carry both pages.
// ---------------------------------------------------------------------------

const totalsportekPage = `<!doctype html><html><body>
  <div class="match">
    <h2>Derby County vs Lincoln City</h2>
    <div class="links">
      <a class="stream-link" href="/watch/123">1080p English</a>
      <a class="stream-link" href="https://cdn.example.com/live/1" data-quality="HD">720p Stream</a>
      <a href="#">busted link</a>
      <a href="javascript:void(0)">another busted link</a>
    </div>
  </div>
  <div class="match">
    <h2>Preston North End vs Leeds United</h2>
    <div class="links"><a class="stream-link" href="/watch/456">SD</a></div>
  </div>
</body></html>`;

const footybitePage = `<!doctype html><html><body>
  <table class="match-list"><tbody>
    <tr class="match-row">
      <td class="match-teams">Derby County vs Lincoln City</td>
      <td class="match-links">
        <a class="stream-link" href="/stream/789">1080p English</a>
        <a class="stream-link" href="https://cdn.example.com/live/1">HD</a>
        <a href="#">busted link</a>
        <a href="javascript:void(0)">busted link</a>
      </td>
    </tr>
    <tr class="match-row">
      <td class="match-teams">Preston North End vs Leeds United</td>
      <td class="match-links"><a class="stream-link" href="/stream/456">SD</a></td>
    </tr>
  </tbody></table>
</body></html>`;

// soccerstreams is TWO-HOP: the listing page (hop 1) links to a per-match page
// (hop 2) which carries the actual stream anchors.
const soccerListing = `<!doctype html><html><body>
  <div class="match-list">
    <div class="match-row">
      <a href="/watch/derby-county-vs-lincoln-city">Derby County vs Lincoln City</a>
    </div>
    <div class="match-row">
      <a href="/watch/preston-north-end-vs-leeds-united">Preston North End vs Leeds United</a>
    </div>
  </div>
</body></html>`;

const soccerMatch = `<!doctype html><html><body>
  <div class="channels">
    <a class="stream-link" href="/stream/abc123">1080p English</a>
    <a class="stream-link" href="https://cdn.example.com/live/3">720p</a>
    <a href="javascript:void(0)">busted link</a>
  </div>
</body></html>`;

const hesgoalPage = `<!doctype html><html><body>
  <div class="match">
    <h2>Derby County vs Lincoln City</h2>
    <div class="channels">
      <h3>English</h3>
      <a class="stream-link" href="/watch/111">1080p English HD</a>
      <iframe data-src="https://cdn.example.com/embed/1"></iframe>
      <iframe src="/embed/2"></iframe>
      <a href="#">busted link</a>
    </div>
  </div>
  <div class="match">
    <h2>Preston North End vs Leeds United</h2>
    <div class="channels"><h3>Spanish</h3><iframe data-src="https://cdn.example.com/embed/3"></iframe></div>
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// Route stub — mimics the live fetch/keyed-by-URL surface the scraper calls.
// Unknown URLs simulate a blocked page (403) so adapters degrade to [].
// ---------------------------------------------------------------------------

const fixtureSlug = "derby-county-vs-lincoln-city";
const soccerMatchUrl = `https://soccerstreams.net/watch/${fixtureSlug}`;

const ROUTES: Readonly<Record<string, string>> = {
	[SITES.totalsportek[0] as string]: totalsportekPage,
	[SITES.soccerstreams[0] as string]: soccerListing,
	[soccerMatchUrl]: soccerMatch,
	[SITES.footybite[0] as string]: footybitePage,
	[SITES.hesgoal[0] as string]: hesgoalPage,
};

async function stubFetch(opts: FetchHtmlOptions): Promise<string> {
	const html = ROUTES[opts.url];
	if (html === undefined) {
		throw new HttpStatusError(403, `canned stub has no page for ${opts.url}`);
	}
	return html;
}

// A fetch stub that fails for one source but routes the rest.
function failingFetchStub(source: StreamSource, cause: unknown): typeof stubFetch {
	return async (opts) => {
		if (opts.url === SITES[source]?.[0]) throw cause;
		return stubFetch(opts);
	};
}

// ---------------------------------------------------------------------------
// Fixture + helpers
// ---------------------------------------------------------------------------

const LIVE_FIXTURE: Fixture = {
	id: "smoke-fixture",
	competition: { name: "Championship", code: "ELC" },
	status: "IN_PLAY",
	utcDate: "2026-08-08T14:00:00Z",
	homeTeam: { id: "342", name: "Derby County F.C.", shortName: "Derby County" },
	awayTeam: { id: "ft-lincoln-city", name: "Lincoln City", shortName: "Lincoln City" },
	score: { home: 0, away: 0 },
};

const OTHER_FIXTURE: Fixture = {
	id: "smoke-other",
	competition: { name: "Championship", code: "ELC" },
	status: "IN_PLAY",
	utcDate: "2026-08-08T14:00:00Z",
	homeTeam: { id: "pn", name: "Preston North End", shortName: "Preston" },
	awayTeam: { id: "lu", name: "Leeds United", shortName: "Leeds" },
	score: { home: 0, away: 0 },
};

const NEGATIVE_FIXTURE: Fixture = {
	id: "smoke-absent",
	competition: { name: "Championship", code: "ELC" },
	status: "IN_PLAY",
	utcDate: "2026-08-08T14:00:00Z",
	homeTeam: { id: "sw", name: "Sheffield Wednesday", shortName: "Sheffield Weds" },
	awayTeam: { id: "dc", name: "Derby County", shortName: "Derby" },
	score: null,
};

function scrape(fixture: Fixture, fetcher = stubFetch): Promise<StreamLink[]> {
	return scrapeStreamsForFixture({ fixture, fetchHtml: fetcher });
}

function sourceSet(links: StreamLink[]): Set<string> {
	return new Set(links.map((link) => link.source));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("all adapters (offline smoke)", () => {
	test("every source finds the live fixture and returns stream links", async () => {
		const links = await scrape(LIVE_FIXTURE);
		expect(links.length).toBeGreaterThan(0);
		// All four sources must produce at least one link.
		expect(sourceSet(links)).toEqual(new Set(["totalsportek", "soccerstreams", "footybite", "hesgoal"]));
		// Substituted links are absolute http(s), never junky.
		for (const link of links) {
			expect(link.url).toMatch(/^https?:\/\//);
			expect(link.url).not.toMatch(/javascript:/);
		}
	});

	test("labels are populated; quality/language may be null (best-effort)", async () => {
		const links = await scrape(LIVE_FIXTURE);
		for (const link of links) {
			expect(link.label.length).toBeGreaterThan(0);
			expect(link.quality === null || typeof link.quality === "string").toBe(true);
			expect(link.language === null || typeof link.language === "string").toBe(true);
		}
	});

	test("a fixture of the day other than Derby is found too", async () => {
		const links = await scrape(OTHER_FIXTURE);
		// Both canned pages contain a Preston vs Leeds row; soccerstreams links
		// to /watch/preston-...-vs-leeds-united.
		expect(links.length).toBeGreaterThan(0);
	});

	test("a fixture absent from every listing returns no links", async () => {
		const links = await scrape(NEGATIVE_FIXTURE);
		expect(links).toEqual([]);
	});
});

describe("dedupe across sources", () => {
	test("same URL on two sources collapses to one (first source wins)", async () => {
		// https://cdn.example.com/live/1 appears in totalsportek (source 1) and
		// footybite (source 3) and hesgoal? no — only footybite forks it, but
		// the first-seen rule keeps totalsportek's copy and drops footybite's.
		const links = await scrape(LIVE_FIXTURE);
		const dupeRepeaters = links.filter((link) => link.url === "https://cdn.example.com/live/1");
		expect(dupeRepeaters).toHaveLength(1);
		expect(dupeRepeaters[0]?.source).toBe("totalsportek");
	});
});

describe("JS-shell fallback (soccerstreams)", () => {
	test("script-only listing + match page still yields links", async () => {
		// Both soccerstreams hops rendered as a bare <script> JSON blob with no
		// DOM anchors: hop 1 finds the match-page URL from the fixture tokens,
		// hop 2 extracts stream URLs from the match page's script.
		const listing = `<!doctype html><html><body>
		  <script type="application/json">
		    {"matches":[{"home":"Derby County","away":"Lincoln City",
		                 "url":"/watch/derby-county-vs-lincoln-city"},
		                {"home":"Preston North End","away":"Leeds United",
		                 "url":"/watch/preston-north-end-vs-leeds-united"}]}
		  </script>
		</body></html>`;

		const matchPage = `<!doctype html><html><body>
		  <script type="application/json">
		    {"channels":[{"label":"1080p English","url":"/stream/js1"},
		                 {"label":"720p","url":"/stream/js2"}]}
		  </script>
		</body></html>`;

		const jsShellRoutes: Record<string, string> = {
			[SITES.soccerstreams[0] as string]: listing,
			[soccerMatchUrl]: matchPage,
		};

		const links = await scrape(
			LIVE_FIXTURE,
			async (opts) => {
				const html = jsShellRoutes[opts.url];
				if (html === undefined) {
					throw new HttpStatusError(403, `canned stub has no page for ${opts.url}`);
				}
				return html;
			},
		);

		const soccer = links.filter((link) => link.source === "soccerstreams");
		expect(soccer).toHaveLength(2);
		expect(soccer.map((link) => link.url)).toEqual(
			expect.arrayContaining([
				"https://soccerstreams.net/stream/js1",
				"https://soccerstreams.net/stream/js2",
			]),
		);
	});
});

describe("adapter isolation", () => {
	test("a network failure on one source leaves others running", async () => {
		const links = await scrape(
			LIVE_FIXTURE,
			failingFetchStub("hesgoal", new NetworkError("boost", { cause: new Error("canned") })),
		);
		expect(links.length).toBeGreaterThan(0);
		expect(sourceSet(links).has("hesgoal")).toBe(false);
	});

	test("an HTTP failure (blocked page) on one source degrades to []", async () => {
		const links = await scrape(
			LIVE_FIXTURE,
			failingFetchStub("hesgoal", new HttpStatusError(403, "cloudflare block")),
		);
		expect(links.length).toBeGreaterThan(0);
		expect(sourceSet(links).has("hesgoal")).toBe(false);
	});

	test("an unexpected throw on one source is logged and masked", async () => {
		const links = await scrape(
			LIVE_FIXTURE,
			failingFetchStub("hesgoal", new Error("canned: parse crawl")),
		);
		expect(links.length).toBeGreaterThan(0);
		expect(sourceSet(links).has("hesgoal")).toBe(false);
	});
});