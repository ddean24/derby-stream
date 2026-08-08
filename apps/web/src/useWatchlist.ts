import { useCallback, useState } from "react";

const STORAGE_KEY = "derby-streams:watchlist";

function readWatchlist(): Set<string> {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw === null) return new Set();
		const parsed: unknown = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return new Set();
		return new Set(parsed.filter((item): item is string => typeof item === "string"));
	} catch {
		return new Set();
	}
}

function writeWatchlist(ids: ReadonlySet<string>): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
	} catch {
		// Storage disabled/full — the watchlist is a best-effort convenience.
	}
}

// Browser-persisted watchlist of fixture ids backed by localStorage. Pure
// client state: no account, no sync, no backend (see PLAN.md item 7.3).
export function useWatchlist() {
	const [watched, setWatched] = useState<ReadonlySet<string>>(readWatchlist);

	const isWatched = useCallback((fixtureId: string): boolean => watched.has(fixtureId), [watched]);

	const toggle = useCallback((fixtureId: string) => {
		setWatched((previous) => {
			const next = new Set(previous);
			if (next.has(fixtureId)) {
				next.delete(fixtureId);
			} else {
				next.add(fixtureId);
			}
			writeWatchlist(next);
			return next;
		});
	}, []);

	return { isWatched, toggle };
}