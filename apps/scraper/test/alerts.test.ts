/**
 * Tests for the matchday alerts logic (src/alerts.ts). Covers the pure pieces:
 * finding which fixtures are newly ready to alert on, and message formatting.
 * The fs-backed read/write helpers and the Slack POST are deliberately NOT
 * exercised here — notify.ts is a thin CLI around them and the webhook is a
 * no-op without SLACK_WEBHOOK_URL.
 */

import { describe, expect, test } from "bun:test";
import type { Fixture, StreamLink, StreamsByFixture } from "@derby-streams/shared";
import { findPendingAlerts, slackMessage } from "../src/alerts.ts";

const FIXTURE: Fixture = {
	id: "cup-eco-2026-08-08-derby-county-vs-lincoln-city",
	competition: { name: "EFL Cup", code: "ECO" },
	status: "IN_PLAY",
	utcDate: "2026-08-08T14:00:00Z",
	homeTeam: { id: "342", name: "Derby County FC", shortName: "Derby County" },
	awayTeam: { id: "ft-lincoln-city", name: "Lincoln City", shortName: "Lincoln City" },
	score: { home: 0, away: 0 },
};

const OTHER_FIXTURE: Fixture = {
	id: "561767",
	competition: { name: "Championship", code: "ELC" },
	status: "IN_PLAY",
	utcDate: "2026-08-15T14:00:00Z",
	homeTeam: { id: "348", name: "Charlton Athletic FC", shortName: "Charlton" },
	awayTeam: { id: "342", name: "Derby County FC", shortName: "Derby County" },
	score: null,
};

function stream(fixtureId: string, urls: string[]): StreamsByFixture {
	return {
		fixtureId,
		links: urls.map(
			(url): StreamLink => ({ url, source: "totalsportek", label: url, quality: null, language: null }),
		),
	};
}

describe("findPendingAlerts", () => {
	test("flags fixtures with links that are not yet alerted", () => {
		const pending = findPendingAlerts(
			[stream(FIXTURE.id, ["https://cdn.example.com/live/1"])],
			[FIXTURE],
			new Set(),
		);
		expect(pending).toHaveLength(1);
		expect(pending[0]?.fixtureId).toBe(FIXTURE.id);
		expect(pending[0]?.fixture).toBe(FIXTURE);
	});

	test("skips fixtures with no links", () => {
		const pending = findPendingAlerts([stream(FIXTURE.id, [])], [FIXTURE], new Set());
		expect(pending).toEqual([]);
	});

	test("skips fixtures already alerted", () => {
		const pending = findPendingAlerts(
			[stream(FIXTURE.id, ["https://x/live"])],
			[FIXTURE],
			new Set([FIXTURE.id]),
		);
		expect(pending).toEqual([]);
	});

	test("ignores duplicate source urls when counting sources", () => {
		const entry: StreamsByFixture = {
			fixtureId: FIXTURE.id,
			links: [
				{ url: "https://x/1", source: "totalsportek", label: "a", quality: null, language: null },
				{ url: "https://x/2", source: "soccerstreams", label: "b", quality: null, language: null },
			],
		};
		const pending = findPendingAlerts([entry], [FIXTURE], new Set());
		expect(pending).toHaveLength(1);
	});

	test("joins fixtures.json for the message context", () => {
		const pending = findPendingAlerts(
			[stream(OTHER_FIXTURE.id, ["https://outer/league"])],
			[OTHER_FIXTURE],
			new Set(),
		);
		expect(pending[0]?.fixture).toBe(OTHER_FIXTURE);
	});
});

describe("slackMessage", () => {
	test("names the teams, competition, and kickoff", () => {
		const message = slackMessage({
			fixture: FIXTURE,
			fixtureId: FIXTURE.id,
			links: [{ url: "https://x/1", source: "totalsportek", label: "1080p", quality: "1080p", language: "eng" }],
		});
		expect(message).toContain("Derby County vs Lincoln City");
		expect(message).toContain("(ECO)");
		expect(message).toContain("1 stream(s) across 1 source(s)");
		expect(message).toContain("<https://x/1|1080p>");
	});

	test("falls back to fixture id when the fixture is missing", () => {
		const message = slackMessage({
			fixtureId: "mystery-match",
			links: [{ url: "https://x/1", source: "hesgoal", label: "hd", quality: null, language: null }],
		});
		expect(message).toContain("mystery-match");
	});
});