/**
 * Self-hosted team crests (ROADMAP.md item 8.7).
 *
 * football-data.org exposes crests at `crests.football-data.org/{teamId}.svg`.
 * Instead of hotlinking that CDN from the web app, the scraper downloads the
 * crests server-side into data/crests/ (committed), and the web copies them
 * into its build so the site stays self-contained if the CDN blocks
 * hotlinking or goes away.
 *
 * Only teams with a numeric football-data id get a crest (cup opponents from
 * cupFixtures.ts carry `ft-…` ids and have no crest — the UI shows a monogram
 * for those). Downloads are sequential with a polite delay so a scrape never
 * hammers the CDN, and a network/404 failure merely logs + counts as failed
 * rather than aborting the whole scrape.
 */

import type { Fixture, Team } from "@derby-streams/shared";
import { CRESTS_BASE_URL } from "./config.ts";
import { writeCrest } from "./io.ts";

// Polite pause between crest downloads; the free-tier CDN chokes on bursts.
const CREST_REQUEST_DELAY_MS = 250;

const NUMERIC_ID = /^\d+$/;

export interface FetchCrestsOptions {
	// Injectable fetch (tests swap in a stub); defaults to global fetch.
	fetch?: (url: string) => Promise<Response>;
	// Directory to write crests under (data/crests/ by default); tests point
	// this at a throwaway tmp dir.
	dir?: string;
	// Direct team list override; when absent the team list is derived from the
	// fixtures argument (home + away of every fixture).
	teams?: readonly Team[];
}

export interface CrestSummary {
	fetched: number;
	// Team ids ignored because they have no football-data crest (non-numeric
	// ids like the `ft-*` cup opponents).
	skipped: number;
	// Fetch/write failures — logged, never thrown.
	failed: number;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function teamIdsFromFixtures(fixtures: readonly Fixture[]): string[] {
	const ids = new Set<string>();
	for (const fixture of fixtures) {
		ids.add(fixture.homeTeam.id);
		ids.add(fixture.awayTeam.id);
	}
	return [...ids];
}

export async function fetchAllCrests(
	fixtures: readonly Fixture[],
	opts: FetchCrestsOptions = {},
): Promise<CrestSummary> {
	const fetchFn = opts.fetch ?? ((url: string) => fetch(url));
	const teams =
		opts.teams ?? teamIdsFromFixtures(fixtures).map((id) => ({ id, name: id, shortName: id }));

	const numeric = teams.filter((team) => NUMERIC_ID.test(team.id));
	const skipped = teams.length - numeric.length;

	let fetched = 0;
	let failed = 0;
	for (let index = 0; index < numeric.length; index += 1) {
		const team = numeric[index];
		if (team === undefined) continue;
		const url = `${CRESTS_BASE_URL}/${team.id}.svg`;
		try {
			const res = await fetchFn(url);
			if (!res.ok) {
				throw new Error(`HTTP ${res.status} ${res.statusText}`);
			}
			const content = await res.text();
			if (content.length === 0) {
				throw new Error("empty crest response");
			}
			writeCrest(team.id, content, opts.dir);
			fetched += 1;
		} catch (cause) {
			failed += 1;
			console.error(
				`[scraper] crest download failed for ${team.id} (${cause instanceof Error ? cause.message : String(cause)})`,
			);
		}
		// Polite pacing between requests (no need to wait after the last one).
		if (index < numeric.length - 1) {
			await sleep(CREST_REQUEST_DELAY_MS);
		}
	}

	return { fetched, skipped, failed };
}