/**
 * Tests the server-side crest downloader (src/crests.ts) — ROADMAP.md item 8.7.
 * Focus: the self-hosting contract. Numeric team ids are fetched once each
 * (deduped), non-numeric ids (cup opponents like `ft-…`) are skipped, a failed
 * fetch is recorded without throwing, and every downloaded crest lands under a
 * tmp dir's crests/ folder so the web can self-host them.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Fixture, Team } from "@derby-streams/shared";
import { CRESTS_BASE_URL } from "../src/config.ts";
import { fetchAllCrests } from "../src/crests.ts";
import { crestFilePath } from "../src/io.ts";

function freshDir(): string {
	return mkdtempSync(join(tmpdir(), "derby-streams-crests-"));
}

const OK_CREST = "<svg xmlns='http://www.w3.org/2000/svg'><rect width='100' height='100'/></svg>";

function okFetch(url: string): Promise<Response> {
	return Promise.resolve(new Response(OK_CREST, { status: 200 }));
}

function fixture(home: Team, away: Team, id: string): Fixture {
	return {
		id,
		competition: { name: "Championship", code: "ELC" },
		status: "SCHEDULED",
		utcDate: "2026-08-08T14:00:00Z",
		homeTeam: home,
		awayTeam: away,
		score: null,
	};
}

const DERBY: Team = { id: "342", name: "Derby County F.C.", shortName: "Derby County", crest: null };
const SHEFFIELD_WED: Team = { id: "345", name: "Sheffield Wednesday", shortName: "Sheffield Weds", crest: null };
const LINCOLN: Team = { id: "ft-lincoln-city", name: "Lincoln City", shortName: "Lincoln City", crest: null };

describe("fetchAllCrests", () => {
	test("writes distinct numeric ids into tmp dir's crests/ folder; skips ft-…", async () => {
		const dir = freshDir();
		const fixtures = [fixture(DERBY, LINCOLN, "one"), fixture(SHEFFIELD_WED, LINCOLN, "two")];
		const summary = await fetchAllCrests(fixtures, { fetch: okFetch, dir });

		expect(summary).toEqual({ fetched: 2, skipped: 1, failed: 0 });

		expect(readFileSync(crestFilePath("342", dir), "utf8")).toBe(OK_CREST);
		expect(readFileSync(crestFilePath("345", dir), "utf8")).toBe(OK_CREST);
		// The ft-… opponent is skipped entirely — no file for it.
		expect(existsSync(crestFilePath("ft-lincoln-city", dir))).toBe(false);
	});

	test("dedupes: the same id is fetched once however often it appears", async () => {
		const dir = freshDir();
		const urls: string[] = [];
		const trackingFetch = (url: string) => {
			urls.push(url);
			return Promise.resolve(new Response(OK_CREST, { status: 200 }));
		};
		const fixtures = [
			fixture(DERBY, LINCOLN, "a"),
			fixture(DERBY, LINCOLN, "b"),
			fixture({ ...DERBY, id: "ft-lincoln-city" }, DERBY, "c"), // Derby as away again
		];
		const summary = await fetchAllCrests(fixtures, { fetch: trackingFetch, dir });

		expect(summary.fetched).toBe(1);
		expect(urls).toEqual([`${CRESTS_BASE_URL}/342.svg`]);
	});

	test("404/500 responses are recorded as failed without throwing", async () => {
		const dir = freshDir();
		const failingFetch = (url: string) => {
			if (url.endsWith("/342.svg")) {
				return Promise.resolve(new Response("Not Found", { status: 404 }));
			}
			return Promise.resolve(new Response("server error", { status: 500 }));
		};
		const summary = await fetchAllCrests([fixture(DERBY, SHEFFIELD_WED, "a")], {
			fetch: failingFetch,
			dir,
		});

		expect(summary).toEqual({ fetched: 0, skipped: 0, failed: 2 });
		expect(existsSync(crestFilePath("342", dir))).toBe(false);
		expect(existsSync(crestFilePath("345", dir))).toBe(false);
	});

	test("a thrown network error never escapes fetchAllCrests", async () => {
		const dir = freshDir();
		const throwingFetch = () => Promise.reject(new Error("connection refused"));
		const summary = await fetchAllCrests([fixture(DERBY, LINCOLN, "a")], {
			fetch: throwingFetch,
			dir,
		});

		expect(summary).toEqual({ fetched: 0, skipped: 1, failed: 1 });
		expect(existsSync(crestFilePath("342", dir))).toBe(false);
	});
});