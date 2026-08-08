import { useEffect, useState } from "react";

export type HashRoute =
	| { type: "list" }
	| { type: "match"; fixtureId: string }
	| { type: "calendar" };

const MATCH_PREFIX = "#/match/";
const CALENDAR_PREFIX = "#/calendar";

function parseHash(hash: string): HashRoute {
	if (hash.startsWith(MATCH_PREFIX)) {
		const fixtureId = hash.slice(MATCH_PREFIX.length);
		if (fixtureId.length > 0) {
			return { type: "match", fixtureId };
		}
	}
	if (hash.startsWith(CALENDAR_PREFIX)) {
		return { type: "calendar" };
	}
	return { type: "list" };
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
