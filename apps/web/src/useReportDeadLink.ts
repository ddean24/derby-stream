import { useCallback, useState } from "react";

const STORAGE_KEY = "derby-streams:dead-link-reports";

// A fixture-id -> "YYYY-MM-DD" map of the most recent report per fixture.
type ReportDates = Record<string, string>;

// One calendar-day string used for the spam guard, computed when the report
// page renders so the "already reported today" window can't shift mid-session
// if the clock ticks over to the next day.
export function todayLocalDate(): string {
	const now = new Date();
	const month = `${now.getMonth() + 1}`.padStart(2, "0");
	const day = `${now.getDate()}`.padStart(2, "0");
	return `${now.getFullYear()}-${month}-${day}`;
}

function readReportDates(): ReportDates {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw === null) return {};
		const parsed: unknown = JSON.parse(raw) as unknown;
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
		const dates: ReportDates = {};
		for (const [fixtureId, value] of Object.entries(parsed)) {
			if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
				dates[fixtureId] = value;
			}
		}
		return dates;
	} catch {
		return {};
	}
}

function writeReportDates(dates: ReportDates): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dates));
	} catch {
		// Storage disabled/full - the limiter is a best-effort convenience.
	}
}

// Per-fixture/day rate-limit for the "Link dead?" report flow (ROADMAP 8.9).
// Pure client state, same no-server pattern as the watchlist - a user can
// report a given fixture at most once per local calendar day.
export function useReportDeadLink() {
	const [date] = useState(todayLocalDate);
	const [dates, setDates] = useState<ReportDates>(readReportDates);

	const reportedToday = useCallback(
		(fixtureId: string): boolean => dates[fixtureId] === date,
		[dates, date],
	);

	const recordReport = useCallback(
		(fixtureId: string) => {
			setDates((previous) => {
				if (previous[fixtureId] === date) return previous;
				const next = { ...previous, [fixtureId]: date };
				writeReportDates(next);
				return next;
			});
		},
		[date],
	);

	return { reportedToday, recordReport };
}