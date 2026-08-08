import { useEffect, useState } from "react";

export type HashRoute = { type: "list" } | { type: "match"; fixtureId: string };

const MATCH_PREFIX = "#/match/";

function parseHash(hash: string): HashRoute {
	if (hash.startsWith(MATCH_PREFIX)) {
		const fixtureId = hash.slice(MATCH_PREFIX.length);
		if (fixtureId.length > 0) {
			return { type: "match", fixtureId };
		}
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
