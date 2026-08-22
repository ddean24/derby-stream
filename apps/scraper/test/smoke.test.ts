/**
 * Offline smoke tests for the stream adapters.
 *
 * PLAN.md item 6.3 (real matchday smoke test) can only run while a Derby game
 * is actually live — the aggregator sites only list fixtures of the day. These
 * tests fill that gap: they feed each adapter canned HTML/JSON that matches the
 * DOM contract documented in the adapter's header comment, and drive the full
 * pipeline (scrapeStreamsForFixture) so parsing, extraction, dedupe/merge, and
 * per-source isolation are all exercised WITHOUT a live game.
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
// Canned pages — each matches the DOM/JSON contract in the adapter's header
// comment (streamedpk.ts, vipbox.ts).
// ---------------------------------------------------------------------------

// streamed.pk: the /api/matches/football JSON endpoint.
const streamedJson = JSON.stringify([
	{
		id: "derby-county-vs-lincoln-city-1",
		title: "Derby County vs Lincoln City",
		teams: { home: { name: "Derby County" }, away: { name: "Lincoln City" } },
		sources: [{ source: "echo", id: "derby-county-vs-lincoln-city-1" }],
	},
	{
		id: "preston-vs-leeds-1",
		title: "Preston North End vs Leeds United",
		teams: { home: { name: "Preston North End" }, away: { name: "Leeds United" } },
		sources: [{ source: "echo", id: "preston-vs-leeds-1" }],
	},
]);

// streamed.pk: the /watch/{id}/{source}/{n} player page (one iframe).
const streamedWatch = `<!doctype html><html><body>
  <iframe title="Echo Player" src="https://embed.st/embed/echo/derby-1/1"></iframe>
</body></html>`;

// vipbox.fm: the /football-live schedule listing.
const vipboxListing = `<!doctype html><html><body>
  <a aria-controls="1" class="btn btn-secondary" href="/football/derby-county-vs-lincoln-city-streams" title="Derby County vs Lincoln City">Derby County vs Lincoln City</a>
  <a aria-controls="2" class="btn btn-secondary" href="/football/preston-vs-leeds-streams" title="Preston North End vs Leeds United">Preston North End vs Leeds United</a>
</body></html>`;

// vipbox.fm: the /football/{slug}-streams detail page (iframe embeds).
const vipboxDetail = `<!doctype html><html><body>
  <iframe src="//nervosecaama.qpon/rJBVAuWSEhKy0cPPe/9431"></iframe>
  <iframe src="//hai8g.com/4/8553101"></iframe>
</body></html>`;

// ---------------------------------------------------------------------------
// Route stub — mimics the live fetch/keyed-by-URL surface the scraper calls.
// Unknown URLs simulate a blocked page (403) so adapters degrade to [].
// ---------------------------------------------------------------------------

const streamedBase = SITES.streamedpk[0] as string;
const vipboxBase = SITES.vipbox[0] as string;
const vipboxDetailUrl = `${vipboxBase}football/derby-county-vs-lincoln-city-streams`;

const ROUTES: Readonly<Record<string, string>> = {
	[`${streamedBase}api/matches/football`]: streamedJson,
	[`${streamedBase}watch/derby-county-vs-lincoln-city-1/echo/0`]: streamedWatch,
	[`${streamedBase}watch/preston-vs-leeds-1/echo/0`]: streamedWatch,
	[`${vipboxBase}football-live`]: vipboxListing,
	[vipboxDetailUrl]: vipboxDetail,
	[`${vipboxBase}football/preston-vs-leeds-streams`]: vipboxDetail,
};

async function stubFetch(opts: FetchHtmlOptions): Promise<string> {
	const html = ROUTES[opts.url];
	if (html === undefined) {
		throw new HttpStatusError(403, `canned stub has no page for ${opts.url}`);
	}
	return html;
}

// A fetch stub that fails for one source (any of its URLs) but routes the rest.
function failingFetchStub(source: StreamSource, cause: unknown): typeof stubFetch {
	const base = SITES[source]?.[0] ?? "";
	return async (opts) => {
		if (base !== "" && opts.url.startsWith(base)) throw cause;
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
		// Both sources must produce at least one link.
		expect(sourceSet(links)).toEqual(new Set(["streamedpk", "vipbox"]));
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
		// streamedpk + vipbox both carry a Preston vs Leeds row.
		expect(links.length).toBeGreaterThan(0);
	});

	test("a fixture absent from every listing returns no links", async () => {
		const links = await scrape(NEGATIVE_FIXTURE);
		expect(links).toEqual([]);
	});
});

describe("dedupe across sources", () => {
	test("same URL on two sources collapses to one (first source wins)", async () => {
		// Both remaining sources surface the same embed URL; the first-seen rule
		// (STREAM_SOURCES order: streamedpk, then vipbox) keeps streamedpk's copy.
		const DUPE = "https://cdn.example.com/live/1";
		const sharedRoutes: Record<string, string> = {
			[`${streamedBase}watch/derby-county-vs-lincoln-city-1/echo/0`]: `<iframe src="${DUPE}"></iframe>`,
			[vipboxDetailUrl]: `<iframe src="${DUPE}"></iframe>`,
		};
		const links = await scrape(LIVE_FIXTURE, async (opts) => {
			const html = sharedRoutes[opts.url] ?? ROUTES[opts.url];
			if (html === undefined) {
				throw new HttpStatusError(403, `canned stub has no page for ${opts.url}`);
			}
			return html;
		});
		const dupeRepeaters = links.filter((link) => link.url === DUPE);
		expect(dupeRepeaters).toHaveLength(1);
		expect(dupeRepeaters[0]?.source).toBe("streamedpk");
	});
});

describe("adapter isolation", () => {
	test("a network failure on one source leaves others running", async () => {
		const links = await scrape(
			LIVE_FIXTURE,
			failingFetchStub("vipbox", new NetworkError("boost", { cause: new Error("canned") })),
		);
		expect(links.length).toBeGreaterThan(0);
		expect(sourceSet(links).has("vipbox")).toBe(false);
	});

	test("an HTTP failure (blocked page) on one source degrades to []", async () => {
		const links = await scrape(
			LIVE_FIXTURE,
			failingFetchStub("vipbox", new HttpStatusError(403, "cloudflare block")),
		);
		expect(links.length).toBeGreaterThan(0);
		expect(sourceSet(links).has("vipbox")).toBe(false);
	});

	test("an unexpected throw on one source is logged and masked", async () => {
		const links = await scrape(
			LIVE_FIXTURE,
			failingFetchStub("vipbox", new Error("canned: parse crawl")),
		);
		expect(links.length).toBeGreaterThan(0);
		expect(sourceSet(links).has("vipbox")).toBe(false);
	});
});
