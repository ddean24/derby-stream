/**
 * Matchday stream alerts.
 *
 * Goal: "beep when streams go live" — the static site can't push, so the
 * scraper CI step notifies a Slack webhook once per fixture the first time
 * streams are found for it. Alerts are one-shot: the set of already-alerted
 * fixture ids is persisted to data/alerts.json (same committed-data pattern as
 * fixtures/streams), so a re-run never spams the channel.
 *
 * Slack is the zero-infra channel since it only needs a webhook URL in the
 * repo secret. Email and browser-push would each need a service; they are
 * deliberately out of scope here (see PLAN.md item 7.2).
 *
 * The notify CLI (src/notify.ts) runs AFTER the scraper in CI:
 *   1. reads data/streams.json + data/alerts.json
 *   2. for every fixture with streams not yet alerted, POSTs a message
 *   3. writes the alerted fixture ids back to data/alerts.json
 */

import type { Fixture, StreamLink, StreamsByFixture } from "@derby-streams/shared";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./io.ts";

export const ALERTED_FILE = "alerts.json";
export const SLACK_WEBHOOK_URL: string = process.env.SLACK_WEBHOOK_URL ?? "";

// A fixture whose streams have appeared but which we have not yet alerted on.
export interface PendingAlert {
	fixtureId: string;
	fixture?: Fixture;
	links: StreamLink[];
}

function readJson<T>(filePath: string, fallback: T): T {
	try {
		return JSON.parse(readFileSync(filePath, "utf8")) as T;
	} catch {
		return fallback;
	}
}

export function readStreams(): StreamsByFixture[] {
	return readJson<StreamsByFixture[]>(join(DATA_DIR, "streams.json"), []);
}

export function readFixtures(): Fixture[] {
	return readJson<Fixture[]>(join(DATA_DIR, "fixtures.json"), []);
}

export function readAlertedIds(): string[] {
	return readJson<string[]>(join(DATA_DIR, ALERTED_FILE), []);
}

export function writeAlertedIds(alerted: readonly string[]): void {
	mkdirSync(DATA_DIR, { recursive: true });
	// Deterministic and diff-friendly: de-duplicated, sorted.
	writeFileSync(
		join(DATA_DIR, ALERTED_FILE),
		`${JSON.stringify([...new Set(alerted)].sort(), null, 2)}\n`,
		"utf8",
	);
}

// Stream entries with links that have not yet been alerted for this fixture,
// joined against fixtures.json so the message can name the teams.
export function findPendingAlerts(
	streams: StreamsByFixture[],
	fixtures: Fixture[],
	alertedIds: ReadonlySet<string>,
): PendingAlert[] {
	const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
	const pending: PendingAlert[] = [];

	for (const entry of streams) {
		if (entry.links.length === 0) continue;
		if (alertedIds.has(entry.fixtureId)) continue;
		pending.push({
			fixture: fixturesById.get(entry.fixtureId),
			fixtureId: entry.fixtureId,
			links: entry.links,
		});
	}

	return pending;
}

export function slackMessage(alert: PendingAlert): string {
	const fixture = alert.fixture;
	// Without a matching fixtures.json row we can't name the teams, so the
	// fixture id is the only reliable identifier.
	const home = fixture?.homeTeam.shortName ?? alert.fixtureId;
	const away = fixture?.awayTeam.shortName ?? "?";
	const comp = fixture?.competition.code ?? "";
	const kickoff = fixture?.utcDate
		? formatKickoff(new Date(fixture.utcDate))
		: "unknown kickoff";
	const sources = new Set(alert.links.map((link) => link.source)).size;

	return [
		`*${home} vs ${away} — streams are live!${comp ? ` (${comp})` : ""}*`,
		`${alert.links.length} stream(s) across ${sources} source(s) · ${kickoff}`,
		"",
		...alert.links.map((link) => `• <${link.url}|${link.label}>`),
	].join("\n");
}

// Human-friendly kickoff, matching the web app's format (lib/format.ts).
function formatKickoff(date: Date): string {
	if (Number.isNaN(date.getTime())) return "unknown kickoff";
	return new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}