/**
 * Tests data/meta.json persistence (src/io.ts) — the freshness metadata written
 * by the scraper so the web app can render "Data as of …" (ROADMAP.md item
 * 8.1). Focus is on the NON-DESTRUCTIVE contract: an idle run that changes
 * nothing must not bump meta.json (no spurious git diff), while real changes
 * do advance scrapedAt. Uses throwaway tmp dirs like history.test.ts.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendStreamHistory, readMeta, readStreams, writeMeta, writeStreams } from "../src/io.ts";

function freshDir(): string {
	return mkdtempSync(join(tmpdir(), "derby-streams-meta-"));
}

describe("writeMeta / readMeta", () => {
	test("writes pretty JSON with a trailing newline (same style as streams)", () => {
		const tmpDir = freshDir();
		writeMeta({ scrapedAt: "2026-08-08T14:00:00Z", fixturesCount: 1, streamsCount: 2 }, tmpDir);
		const raw = readFileSync(join(tmpDir, "meta.json"), "utf8");
		expect(raw.endsWith("\n")).toBe(true);
		expect(JSON.parse(raw)).toEqual({
			scrapedAt: "2026-08-08T14:00:00Z",
			fixturesCount: 1,
			streamsCount: 2,
		});
	});

	test("readMeta returns the parsed payload and null when absent", () => {
		const tmpDir = freshDir();
		expect(readMeta(tmpDir)).toBeNull();
		writeMeta({ scrapedAt: "2026-08-08T14:00:00Z", fixturesCount: 1, streamsCount: 2 }, tmpDir);
		expect(readMeta(tmpDir)).toEqual({
			scrapedAt: "2026-08-08T14:00:00Z",
			fixturesCount: 1,
			streamsCount: 2,
		});
	});
});

describe("readStreams", () => {
	test("returns [] when absent and the array once written", () => {
		const tmpDir = freshDir();
		expect(readStreams(tmpDir)).toEqual([]);
		const entries = [{ fixtureId: "f1", links: [] }];
		writeStreams(entries, tmpDir);
		expect(readStreams(tmpDir)).toEqual(entries);
	});
});

describe("appendStreamHistory change signal", () => {
	test("returns true only when the snapshot actually changed the file", () => {
		const tmpDir = freshDir();
		const snapshot = {
			fixtureId: "f1",
			at: "2026-08-08T14:00:00Z",
			links: [{ url: "https://x/1", source: "totalsportek" as const, label: "x", quality: null, language: null }],
		};
		expect(appendStreamHistory(snapshot, tmpDir)).toBe(true);
		// Byte-identical snapshot (new timestamp only) -> no-op -> false.
		expect(appendStreamHistory({ ...snapshot, at: "2026-08-08T14:15:00Z" }, tmpDir)).toBe(false);
		// Different links -> real change -> true.
		expect(
			appendStreamHistory(
				{
					...snapshot,
					at: "2026-08-08T14:30:00Z",
					links: [
						{ url: "https://x/1", source: "totalsportek" as const, label: "x", quality: null, language: null },
						{ url: "https://x/2", source: "totalsportek" as const, label: "y", quality: null, language: null },
					],
				},
				tmpDir,
			),
		).toBe(true);
	});
});