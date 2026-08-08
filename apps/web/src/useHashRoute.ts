import { useEffect, useState } from "react";

export type HashRoute =
	| { type: "list"; comp: string | null }
	| { type: "match"; fixtureId: string }
	| { type: "calendar" }
	| { type: "report"; fixtureId: string };

const MATCH_PREFIX = "#/match/";
const CALENDAR_PREFIX = "#/calendar";
const REPORT_PREFIX = "#/report/";

// Reads the competition filter out of a query string like `comp=elc&foo=bar`.
// An absent/empty `comp` parameter means "no filter" (null).
function competitionFromQuery(query: string): string | null {
	const params = new URLSearchParams(query);
	const comp = params.get("comp");
	return comp !== null && comp.length > 0 ? comp : null;
}

export function parseHash(hash: string): HashRoute {
	if (hash.startsWith(MATCH_PREFIX)) {
		const fixtureId = hash.slice(MATCH_PREFIX.length);
		if (fixtureId.length > 0) {
			return { type: "match", fixtureId };
		}
	}
	if (hash.startsWith(CALENDAR_PREFIX)) {
		return { type: "calendar" };
	}
	// Dead-link report pane (ROADMAP 8.9): #/report/<fixtureId> shows the
	// fixture id to paste into the report-dead-link workflow_dispatch page.
	if (hash.startsWith(REPORT_PREFIX)) {
		const fixtureId = hash.slice(REPORT_PREFIX.length);
		if (fixtureId.length > 0) {
			return { type: "report", fixtureId };
		}
	}
	// List route: carry an optional `?comp=<code>` query for the competition
	// filter tab (e.g. `#/?comp=elc`). Without a query the comp is null and the
	// App falls back to the persisted choice in localStorage (ROADMAP 8.8).
	const queryIndex = hash.indexOf("?");
	const query = queryIndex === -1 ? "" : hash.slice(queryIndex + 1);
	return { type: "list", comp: competitionFromQuery(query) };
}

export function useHashRoute(): HashRoute {
	const [route, setRoute] = useState<HashRoute>(() => parseHash(window.location.hash));

	useEffect(() => {
		const handleHashChange = () => setRoute(parseHash(window.location.hash));
		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	return route;
}
