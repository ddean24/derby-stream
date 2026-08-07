import type { Fixture } from "@derby-streams/shared";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_DIR: string =
	process.env.DATA_DIR ?? fileURLToPath(new URL("../../../data/", import.meta.url));

export function writeFixtures(fixtures: Fixture[]): void {
	mkdirSync(DATA_DIR, { recursive: true });
	const filePath = join(DATA_DIR, "fixtures.json");
	writeFileSync(filePath, `${JSON.stringify(fixtures, null, 2)}\n`, "utf8");
}
