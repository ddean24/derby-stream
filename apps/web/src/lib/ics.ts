import type { Fixture } from "@derby-streams/shared";

// Serialises fixtures to an RFC 5545 iCalendar (.ics) document so users can
// subscribe in Google/Apple/Outlook calendars. One VEVENT per fixture, with
// UTC timestamps and a 2-hour default block around kickoff.
const CRLF = "\r\n";

function formatUtc(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
		`T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`
	);
}

// Simple (non-folded) ICS line. Lines >75 octets must be line-folded per the
// spec; summaries are short but we fold defensively.
function icsLine(name: string, value: string): string {
	const line = `${name}:${value}`;
	const segments: string[] = [];
	for (let i = 0; i < line.length; i += 72) {
		segments.push(line.slice(i, i + 72));
	}
	return segments.map((segment, index) => (index === 0 ? segment : ` ${segment}`)).join(CRLF);
}

function fixtureSummary(fixture: Fixture): string {
	const home = fixture.homeTeam.shortName || fixture.homeTeam.name;
	const away = fixture.awayTeam.shortName || fixture.awayTeam.name;
	const comp = fixture.competition.code.length > 0 ? ` (${fixture.competition.code})` : "";
	return `${home} vs ${away}${comp}`;
}

function escapeIcs(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export function buildIcs(fixtures: readonly Fixture[], now: Date = new Date()): string {
	const events = fixtures
		.filter((fixture) => !Number.isNaN(new Date(fixture.utcDate).getTime()))
		.map((fixture) => {
			const start = new Date(fixture.utcDate);
			const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
			return [
				"BEGIN:VEVENT",
				icsLine("UID", `${fixture.id}@derby-streams`),
				icsLine("DTSTAMP", formatUtc(now)),
				icsLine("DTSTART", formatUtc(start)),
				icsLine("DTEND", formatUtc(end)),
				icsLine("SUMMARY", escapeIcs(fixtureSummary(fixture))),
				"END:VEVENT",
			].join(CRLF);
		});

	return [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//derby-streams//derby-streams//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		...events,
		"END:VCALENDAR",
	].join(CRLF);
}

export function downloadIcs(fixtures: readonly Fixture[], filename: string = "derby-fixtures.ics"): void {
	const blob = new Blob([buildIcs(fixtures)], { type: "text/calendar;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
