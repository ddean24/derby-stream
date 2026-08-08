import type { Fixture, ScrapeMeta, StreamHistoryEntry, StreamsByFixture } from "@derby-streams/shared";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_DIR: string =
	process.env.DATA_DIR ?? fileURLToPath(new URL("../../../data/", import.meta.url));

export function writeFixtures(fixtures: Fixture[]): void {
	mkdirSync(DATA_DIR, { recursive: true });
	const filePath = join(DATA_DIR, "fixtures.json");
	writeFileSync(filePath, `${JSON.stringify(fixtures, null, 2)}\n`, "utf8");
}

export function writeStreams(streams: StreamsByFixture[], dir: string = DATA_DIR): void {
	mkdirSync(dir, { recursive: true });
	const filePath = join(dir, "streams.json");
	writeFileSync(filePath, `${JSON.stringify(streams, null, 2)}\n`, "utf8");
}

export function readStreams(dir: string = DATA_DIR): StreamsByFixture[] {
	const filePath = join(dir, "streams.json");
	if (!existsSync(filePath)) return [];
	return JSON.parse(readFileSync(filePath, "utf8")) as StreamsByFixture[];
}

export function writeMeta(meta: ScrapeMeta, dir: string = DATA_DIR): void {
	mkdirSync(dir, { recursive: true });
	const filePath = join(dir, "meta.json");
	writeFileSync(filePath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

export function readMeta(dir: string = DATA_DIR): ScrapeMeta | null {
	const filePath = join(dir, "meta.json");
	if (!existsSync(filePath)) return null;
	return JSON.parse(readFileSync(filePath, "utf8")) as ScrapeMeta;
}

function readStreamHistory(dir: string): StreamHistoryEntry[] {
	const filePath = join(dir, "stream-history.json");
	if (!existsSync(filePath)) {
		return [];
	}
	return JSON.parse(readFileSync(filePath, "utf8")) as StreamHistoryEntry[];
}

export function writeStreamHistory(entries: StreamHistoryEntry[], dir: string = DATA_DIR): void {
	mkdirSync(dir, { recursive: true });
	const filePath = join(dir, "stream-history.json");
	writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

// Append one snapshot for a fixture to data/stream-history.json. A run whose
// links are byte-identical to the fixture's last snapshot is skipped so the
// file only records state CHANGES (appeared/died/grew), staying small and
// meaningful across many fixture refreshes in CI. The dir param exists so tests
// can point at a throwaway tmp dir without DATA_DIR load-order games.
// Returns true when the snapshot actually changed the file, false when it was
// a no-op duplicate; callers use this to decide whether anything changed this
// run (e.g. whether data/meta.json's scrapedAt is worth bumping).
export function appendStreamHistory(snapshot: StreamHistoryEntry, dir: string = DATA_DIR): boolean {
	const history = readStreamHistory(dir);
	const previous = [...history].reverse().find((entry) => entry.fixtureId === snapshot.fixtureId);
	if (previous && JSON.stringify(previous.links) === JSON.stringify(snapshot.links)) {
		return false;
	}
	writeStreamHistory([...history, snapshot], dir);
	return true;
}

export function readStreamHistoryForFixture(
	fixtureId: string,
	dir: string = DATA_DIR,
): StreamHistoryEntry[] {
	return readStreamHistory(dir).filter((entry) => entry.fixtureId === fixtureId);
}

export function crestFilePath(teamId: string, dir: string = DATA_DIR): string {
	return join(dir, "crests", `${teamId}.svg`);
}

export function writeCrest(teamId: string, content: string, dir: string = DATA_DIR): void {
	mkdirSync(join(dir, "crests"), { recursive: true });
	writeFileSync(crestFilePath(teamId, dir), content, "utf8");
}
