/**
 * Cup-fixture source: Wikipedia season page.
 *
 * football-data.org's free key only returns the league (Championship) matches
 * for a team — EFL Cup and FA Cup ties are absent. This module pulls Derby's
 * cup fixtures straight from the Wikipedia season page
 * (CUP_COMPETITIONS + DERBY_WIKI_SEASON_URL in config.ts), where each cup is a
 * section of "football box" tables.
 *
 * Parsing rules (worked out during development against the live page):
 * - Each cup section (`#EFL_Cup`, `#FA_Cup`) is a <section> whose heading
 *   carries the section id; every `<table class="...tmpl-football-box-
 *   collapsible">` inside that section is one fixture.
 * - A box's first <tr> is the fixture row: [date, homeTeam, scoreOrV,
 *   awayTeam, note]. A played fixture shows a score (e.g. "2–1") in the
 *   scoreOrV cell; an unplayed one shows "v".
 * - The box's second <tr> carries the kickoff in its first cell, e.g.
 *   "19:45 BST" or "TBC BST".
 *
 * Kickoff times are converted from UK local (BST/GMT) to UTC so the emitted
 * utcDate matches football-data's ISO format. The parser is defensive: unknown
 * row shapes are skipped rather than failing the whole scrape, and a Wikipedia
 * hiccup degrades to "no cup fixtures this run" without killing the league
 * path.
 */

import type { Fixture, FixtureScore, FixtureStatus, Team } from "@derby-streams/shared";
import { CUP_COMPETITIONS, DERBY_WIKI_SEASON_URL, TEAM_ID } from "./config.ts";
import { fetchHtmlBestEffort, parseHtml } from "./lib/html.ts";
import { normaliseTeamName } from "./lib/nameMatch.ts";

export interface FetchCupFixturesOptions {
	fetchHtml?: typeof fetchHtmlBestEffort;
	url?: string;
}

// UK clock offsets for kickoff-timezone lookups seen on the page.
const UTC_OFFSETS: Readonly<Record<string, number>> = {
	BST: 1, // British Summer Time (UTC+1, summer)
	GMT: 0, // Greenwich Mean Time (UTC+0, winter)
	CEST: 2, // Central European Summer Time
	CET: 1, // Central European Time
	UTC: 0,
	WET: 0,
};

const MONTHS: readonly string[] = [
	"january", "february", "march", "april", "may", "june",
	"july", "august", "september", "october", "november", "december",
];

// A cup kickoff of "TBC" gets the conventional 15:00 UK default; in summer
// (BST) that is 14:00Z — the same rendering football-data gives 15:00 ties.
const DEFAULT_UTC_HOUR = 14;
const DEFAULT_UTC_MINUTE = 0;

const SCORE_PATTERN = /^\s*(\d+)\s*[–\-—−]\s*(\d+)\s*$/;

const DATE_PATTERN = /(\d{1,2})(?:-(\d{1,2}))?\s+([A-Za-z]+)\s+(\d{4})/;

const KICKOFF_PATTERN = /(\d{1,2}):(\d{2})\s*([A-Z]{2,4})?/;

// MAINTENANCE POINT (like SITES in config.ts): Wikipedia lists some cup ties
// as a date window with a "TBC" kickoff (e.g. "7-9 August" for EFL Cup R1),
// so the scraper cannot know the real date/time. When the kickoff is later
// confirmed elsewhere (FotMob, EFL site, etc.), pin it here so our fixtures
// match reality. Key: "<compCode>/<homeSlug>-vs-<awaySlug>".
const CONFIRMED_KICKOFFS: Readonly<Record<string, string>> = {
	// EFL Cup first round, Derby v Lincoln — confirmed for 15:00 BST on 8 Aug
	// (14:00 UTC). Wikipedia still shows "TBC, 7–9 August".
	"eco/derby-county-vs-lincoln-city": "2026-08-08T14:00:00Z",
};

export async function fetchCupFixtures(opts: FetchCupFixturesOptions = {}): Promise<Fixture[]> {
	const fetchHtmlFn = opts.fetchHtml ?? fetchHtmlBestEffort;
	const url = opts.url ?? DERBY_WIKI_SEASON_URL;
	const html = await fetchHtmlFn({ url });
	return parseCupFixturesFromHtml(html);
}

export function parseCupFixturesFromHtml(html: string): Fixture[] {
	const $ = parseHtml(html);
	const fixtures: Fixture[] = [];

	for (const competition of CUP_COMPETITIONS) {
		const heading = $(`#${competition.headingId}`);
		if (heading.length === 0) continue;
		const section = heading.closest("section");
		if (section.length === 0) continue;

		section.find("table.tmpl-football-box-collapsible").each((_, element) => {
			const rows: string[][] = [];
			$(element)
				.find("tr")
				.each((_, tr) => {
					const cells = $(tr)
						.find("td")
						.map((_, td) => $(td).text().replace(/\s+/g, " ").trim())
						.get();
					rows.push(cells);
				});
			const fixture = boxRowsToFixture(rows, competition.name, competition.code);
			if (fixture !== null) fixtures.push(fixture);
		});
	}

	return fixtures.sort((a, b) => a.utcDate.localeCompare(b.utcDate));
}

function boxRowsToFixture(
	rows: readonly string[][],
	competitionName: string,
	competitionCode: string,
): Fixture | null {
	const header = rows[0];
	if (header === undefined || header.length < 4) return null;

	const dateText = header[0] ?? "";
	const homeName = (header[1] ?? "").trim();
	const scoreText = header[2] ?? "";
	const awayName = (header[3] ?? "").trim();

	if (homeName.length === 0 || awayName.length === 0) return null;

	const kickoffText = rows[1]?.[0] ?? "";

	const home = makeTeam(homeName);
	const away = makeTeam(awayName);
	const score = parseScoreCell(scoreText);
	const status: FixtureStatus = score === null ? "SCHEDULED" : "FINISHED";

	const overrideKey = `${competitionCode.toLowerCase()}/${slugTeam(homeName)}-vs-${slugTeam(awayName)}`;
	const confirmedUtcDate = CONFIRMED_KICKOFFS[overrideKey];

	const utcDate = confirmedUtcDate ?? dateAndKickoffToUtc(dateText, kickoffText);
	if (utcDate === null) return null;

	const id = `cup-${competitionCode.toLowerCase()}-${utcDate.slice(0, 10)}-${slugTeam(homeName)}-vs-${slugTeam(awayName)}`;

	return {
		id,
		competition: { name: competitionName, code: competitionCode },
		status,
		utcDate,
		homeTeam: home,
		awayTeam: away,
		score,
	};
}

function makeTeam(rawName: string): Team {
	const name = rawName.trim();
	if (normaliseTeamName(name) === "derby county") {
		return {
			id: String(TEAM_ID),
			name: "Derby County FC",
			shortName: "Derby County",
			crest: `crests/${TEAM_ID}.svg`,
		};
	}
	return {
		id: `ft-${slugTeam(name)}`,
		name,
		shortName: shortTeamName(name),
		crest: null,
	};
}

function shortTeamName(name: string): string {
	const lower = name.toLowerCase();
	for (const suffix of [" f.c.", " fc", " a.f.c.", " afc"]) {
		if (lower.endsWith(suffix)) return name.slice(0, name.length - suffix.length).trim();
	}
	return name;
}

function slugTeam(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseScoreCell(text: string): FixtureScore | null {
	const match = SCORE_PATTERN.exec(text);
	if (match === null) return null;
	const home = Number(match[1]);
	const away = Number(match[2]);
	if (!Number.isInteger(home) || !Number.isInteger(away)) return null;
	return { home, away };
}

function monthIndex(monthName: string): number | null {
	const index = MONTHS.indexOf(monthName.toLowerCase());
	return index >= 0 ? index : null;
}

function dateAndKickoffToUtc(dateText: string, kickoffText: string): string | null {
	const dateMatch = DATE_PATTERN.exec(dateText);
	if (dateMatch === null) return null;

	const day = Number(dateMatch[2] ?? dateMatch[1]);
	const monthDayIndex = monthIndex(dateMatch[3] ?? "");
	const year = Number(dateMatch[4]);
	if (monthDayIndex === null || !Number.isInteger(day) || !Number.isInteger(year)) return null;

	let hour = DEFAULT_UTC_HOUR;
	let minute = DEFAULT_UTC_MINUTE;

	const kickoffMatch = KICKOFF_PATTERN.exec(kickoffText);
	if (kickoffMatch !== null) {
		hour = Number(kickoffMatch[1]);
		minute = Number(kickoffMatch[2]);
		if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
		const zone = kickoffMatch[3];
		const offset = zone !== undefined ? UTC_OFFSETS[zone] : 1; // UK local dates default to BST
		if (offset !== undefined) hour -= offset;
	}

	const utc = new Date(Date.UTC(year, monthDayIndex, day, hour, minute));
	if (Number.isNaN(utc.getTime())) return null;
	// Match football-data's ISO shape exactly ("YYYY-MM-DDTHH:MM:SSZ", no
	// fractional seconds) so both sources render identically on the web.
	return utc.toISOString().replace(/\.000Z$/, "Z");
}

// Merge league (football-data) and cup (Wikipedia) fixtures into one list,
// deduping by (date, home, away). League fixtures win — they are the
// authoritative source for any match that also appears on Wikipedia.
export function mergeFixtures(league: Fixture[], cups: Fixture[]): Fixture[] {
	const leagueKeys = new Set(league.map(fixtureKey));
	const merged = [...league];
	for (const cup of cups) {
		if (leagueKeys.has(fixtureKey(cup))) continue;
		merged.push(cup);
	}
	return merged.sort((a, b) => a.utcDate.localeCompare(b.utcDate));
}

function fixtureKey(fixture: Fixture): string {
	const home = normaliseTeamName(fixture.homeTeam.name);
	const away = normaliseTeamName(fixture.awayTeam.name);
	return `${fixture.utcDate.slice(0, 10)}|${home}|${away}`;
}