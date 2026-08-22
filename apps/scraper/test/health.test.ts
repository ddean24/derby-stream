/**
 * Offline unit tests for the recurring aggregator health check (ROADMAP.md item
 * 8.6). The health check drives OFF SITES (the same URL map the real scraper
 * uses) and accepts an injected fetchHtml — exactly like the adapters do in
 * smoke.test.ts — so these tests feed canned pages / canned failures and never
 * touch the network. The real-aggregator behavior is exercised by the live
 * `start health` command; this file is the regression guard.
 */

import { describe, expect, test } from "bun:test";
import { STREAM_SOURCES } from "@derby-streams/shared";
import type { StreamSource } from "@derby-streams/shared";
import { SITES } from "../src/config.ts";
import { HttpStatusError, NetworkError } from "../src/errors.ts";
import type { FetchHtmlOptions } from "../src/lib/html.ts";
import { checkHealth, formatHealthSummary } from "../src/health.ts";

const GOOD_PAGE = `<!doctype html><html><body>
  <nav><a href="/">home</a><a href="/soccer">soccer</a></nav>
</body></html>`;

// Number of checks a full pass issues = total URLs configured in SITES.
function expectedSiteCount(): number {
	return STREAM_SOURCES.reduce((n, source) => n + SITES[source].length, 0);
}

function okFetcher(): (opts: FetchHtmlOptions) => Promise<string> {
	return async () => GOOD_PAGE;
}

// A fetcher that fails for exactly one base URL and serves canned pages for all
// others — isolates one source without disturbing the rest.
function failingFetcher(url: string, cause: unknown): (opts: FetchHtmlOptions) => Promise<string> {
	return async (opts) => {
		if (opts.url === url) throw cause;
		return GOOD_PAGE;
	};
}

describe("checkHealth (offline, injected fetcher)", () => {
	test("all sites reachable -> passed, zero failures, one check per SITES URL", async () => {
		const report = await checkHealth({ fetchHtml: okFetcher() });

		expect(report.passed).toBe(true);
		expect(report.failures).toHaveLength(0);
		expect(report.sites).toHaveLength(expectedSiteCount());
		expect(report.sites.every((site) => site.ok)).toBe(true);
		// Sources come straight from STREAM_SOURCES, in order.
		expect(report.sites.map((site) => site.source)).toEqual([...STREAM_SOURCES]);
	});

	test("one site HTTP 500 -> that site FAILs, others stay OK, all still checked", async () => {
		const url = SITES.streamedpk[0] as string;
		const report = await checkHealth({
			fetchHtml: failingFetcher(url, new HttpStatusError(500, "boom")),
		});

		expect(report.passed).toBe(false);
		expect(report.failures).toHaveLength(1);
		const failing = report.failures[0]!;
		expect(failing.source).toBe("streamedpk");
		expect(failing.url).toBe(url);
		expect(failing.status).toBe(500);
		// No short-circuit: every configured site was still probed.
		expect(report.sites).toHaveLength(expectedSiteCount());
		expect(report.sites.filter((site) => site.ok)).toHaveLength(expectedSiteCount() - 1);
	});

	test("a bot-blocked 403 -> FAIL with the status surfaced", async () => {
		const url = SITES.streamedpk[0] as string;
		const report = await checkHealth({
			fetchHtml: failingFetcher(url, new HttpStatusError(403, "cloudflare block")),
		});

		expect(report.passed).toBe(false);
		expect(report.failures.map((site) => site.source)).toContain("streamedpk");
		expect(report.failures[0]?.status).toBe(403);
	});

	test("a network error -> FAIL reported by message, no status", async () => {
		const url = SITES.vipbox[0] as string;
		const report = await checkHealth({
			fetchHtml: failingFetcher(url, new NetworkError("dns fail", { cause: new Error("canned") })),
		});

		expect(report.passed).toBe(false);
		expect(report.failures[0]?.source).toBe("vipbox");
		expect(report.failures[0]?.status).toBeUndefined();
		expect(report.failures[0]?.error).toContain("dns fail");
	});

	test("a 200 page with zero anchors -> FAIL (nav-pattern check)", async () => {
		const report = await checkHealth({
			fetchHtml: async () => "<!doctype html><html><body></body></html>",
		});

		expect(report.passed).toBe(false);
		expect(report.failures).toHaveLength(expectedSiteCount());
		expect(report.failures[0]?.error).toMatch(/anchor/i);
	});
});

describe("formatHealthSummary", () => {
	test("all-pass summary names every site and reports healthy", async () => {
		const report = await checkHealth({ fetchHtml: okFetcher() });
		const summary = formatHealthSummary(report);

		expect(summary).toContain("[OK] streamedpk");
		expect(summary).toContain("[OK] vipbox");
		expect(summary).toContain("All 2 aggregator site(s) healthy.");
	});

	test("failing summary marks the culprit and names it in the overall line", async () => {
		const url = SITES.vipbox[0] as string;
		const report = await checkHealth({
			fetchHtml: failingFetcher(url, new HttpStatusError(403, "cloudflare block")),
		});
		const summary = formatHealthSummary(report);

		expect(summary).toContain("[FAIL] vipbox");
		expect(summary).toContain("HTTP 403");
		expect(summary).toContain("[OK] streamedpk");
		expect(summary).toContain("UNHEALTHY: vipbox");
	});
});
