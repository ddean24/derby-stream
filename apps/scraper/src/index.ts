import type { FixtureStatus } from "@derby-streams/shared";
import { fetchCupFixtures, mergeFixtures } from "./cupFixtures.ts";
import {
	AuthError,
	FootballDataError,
	NetworkError,
	RateLimitError,
} from "./errors.ts";
import { fetchFixtures } from "./fixtures.ts";
import { writeFixtures } from "./io.ts";
import { collectStreams } from "./streams.ts";

const UPCOMING_STATUSES: ReadonlySet<FixtureStatus> = new Set<FixtureStatus>([
	"SCHEDULED",
	"TIMED",
	"IN_PLAY",
	"PAUSED",
]);

type CliArgs =
	| { mode: "next" }
	| { mode: "fixture"; id: string }
	| { mode: "usage" };

function parseArgs(argv: readonly string[]): CliArgs {
	const arg = argv[2]?.trim() ?? "";
	if (arg === "" || arg === "next" || arg === "next-kickoff") {
		return { mode: "next" };
	}
	// Anything else is treated as a fixture id — league ids are numeric, and
	// cup ids (from cupFixtures.ts) are non-numeric slugs like
	// "cup-eco-2026-08-09-derby-county-vs-lincoln-city".
	return { mode: "fixture", id: arg };
}

async function run(): Promise<void> {
	const args = parseArgs(process.argv);
	if (args.mode === "usage") {
		console.error("usage: bun run start [next|next-kickoff|<fixture-id>]");
		process.exit(2);
	}

	// A specific fixture id may be finished (finalize/re-scrape), so include
	// finished matches on that path; "next" only cares about upcoming/live ones.
	const includeFinished = args.mode === "fixture";
	const fixtures = mergeFixtures(
		await fetchFixtures({ includeFinished }),
		await fetchCupFixtures().catch((cause) => {
			// A Wikipedia hiccup must not take the pipeline down; fall back to
			// the league fixtures alone (the cup rows are then missing).
			console.error(`[scraper] skipped cup fixtures (${cause instanceof Error ? cause.message : cause})`);
			return [];
		}),
	);
	writeFixtures(fixtures);

	const target =
		args.mode === "fixture"
			? fixtures.find((fixture) => fixture.id === args.id)
			: fixtures.find((fixture) => UPCOMING_STATUSES.has(fixture.status));

	if (!target) {
		if (args.mode === "fixture") {
			console.error(
				`fixture ${args.id} not found; wrote ${fixtures.length} fixtures to data/fixtures.json`,
			);
			process.exit(1);
		}
		console.log(
			`no upcoming or live fixture (${fixtures.length} on file); wrote data/fixtures.json, nothing to scrape`,
		);
		return;
	}

	const collected = await collectStreams([target]);
	const streams = collected.find((entry) => entry.fixtureId === target.id)?.links ?? [];
	const sources = new Set(streams.map((link) => link.source)).size;
	console.log(
		`${target.homeTeam.shortName} vs ${target.awayTeam.shortName} (${target.competition.name}, ${target.status}, ${target.utcDate}): ${streams.length} stream link(s) across ${sources} source(s)`,
	);
	console.log(`wrote ${fixtures.length} fixtures and ${collected.length} stream entries to data/`);
}

async function main(): Promise<void> {
	try {
		await run();
	} catch (error) {
		if (error instanceof AuthError) {
			console.error(`[scraper] auth failed: ${error.message}`);
		} else if (error instanceof RateLimitError) {
			console.error(`[scraper] rate limited: ${error.message}`);
		} else if (error instanceof NetworkError) {
			console.error(`[scraper] network error: ${error.message}`);
		} else if (error instanceof FootballDataError) {
			console.error(`[scraper] football-data error (HTTP ${error.status}): ${error.message}`);
		} else if (error instanceof Error) {
			console.error(`[scraper] unexpected error: ${error.message}`);
		} else {
			console.error("[scraper] unexpected non-Error thrown", error);
		}
		process.exit(1);
	}
}

await main();
