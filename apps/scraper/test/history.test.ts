/**
 * Tests stream-history persistence (src/io.ts). appendStreamHistory writes one
 * snapshot per fixture per data/stream-history.json and skips a run whose links
 * are byte-identical to the fixture's previous snapshot, so the file only
 * records state CHANGES. The dir is passed explicitly so tests write into a
 * throwaway tmp dir and never touch the repo's real data/.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StreamHistoryEntry } from "@derby-streams/shared";
import { appendStreamHistory, readStreamHistoryForFixture } from "../src/io.ts";

// A fresh temp dir per test so snapshots never leak between cases.
function freshDir(): string {
	return mkdtempSync(join(tmpdir(), "derby-streams-history-"));
}

function links(urls: string[]): StreamHistoryEntry["links"] {
	return urls.map((url) => ({
		url,
		source: "streamedpk" as const,
		label: url,
		quality: null,
		language: null,
	}));
}

describe("appendStreamHistory", () => {
	test("appends a first snapshot for a fixture", () => {
		const tmpDir = freshDir();
		const fixtureId = "fixture-a";
		appendStreamHistory({ fixtureId, at: "2026-08-08T14:00:00Z", links: links(["https://x/1"]) }, tmpDir);
		const history = readStreamHistoryForFixture(fixtureId, tmpDir);
		expect(history).toHaveLength(1);
		expect(history[0]?.links).toHaveLength(1);
	});

	test("skips a run identical to the previous snapshot", () => {
		const tmpDir = freshDir();
		const fixtureId = "fixture-b";
		const snapshot = { fixtureId, at: "2026-08-08T14:00:00Z", links: links(["https://x/1"]) };
		appendStreamHistory(snapshot, tmpDir);
		appendStreamHistory({ ...snapshot, at: "2026-08-08T14:15:00Z" }, tmpDir);
		expect(readStreamHistoryForFixture(fixtureId, tmpDir)).toHaveLength(1);
	});

	test("records distinct snapshots as separate entries", () => {
		const tmpDir = freshDir();
		const fixtureId = "fixture-c";
		appendStreamHistory({ fixtureId, at: "2026-08-08T14:00:00Z", links: links(["https://x/1"]) }, tmpDir);
		appendStreamHistory(
			{ fixtureId, at: "2026-08-08T14:15:00Z", links: links(["https://x/1", "https://x/2"]) },
			tmpDir,
		);
		appendStreamHistory({ fixtureId, at: "2026-08-08T14:30:00Z", links: links(["https://x/1"]) }, tmpDir);
		expect(readStreamHistoryForFixture(fixtureId, tmpDir)).toHaveLength(3);
	});

	test("tracks fixtures independently", () => {
		const tmpDir = freshDir();
		const a = "fixture-a";
		const b = "fixture-b";
		appendStreamHistory({ fixtureId: a, at: "2026-08-08T14:00:00Z", links: links(["https://a/1"]) }, tmpDir);
		appendStreamHistory({ fixtureId: b, at: "2026-08-08T14:00:00Z", links: links(["https://b/1"]) }, tmpDir);
		expect(readStreamHistoryForFixture(a, tmpDir)).toHaveLength(1);
		expect(readStreamHistoryForFixture(b, tmpDir)).toHaveLength(1);
	});
});