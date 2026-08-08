import { useCallback, useRef } from "react";
import type { Fixture, StreamsByFixture } from "@derby-streams/shared";
import { streamsForFixture } from "./data";
import { isLive } from "./lib/format";

const SUPPORTED = typeof window !== "undefined" && "Notification" in window;

function grant(): Promise<boolean> {
	if (!SUPPORTED) return Promise.resolve(false);
	if (Notification.permission === "granted") return Promise.resolve(true);
	if (Notification.permission === "denied") return Promise.resolve(false);
	return Notification.requestPermission().then((permission) => permission === "granted");
}

// Client-side "streams are live!" notifications (PLAN.md item 7.3). Watched on
// each refresh: when a watched fixture gains its FIRST stream links, ring a
// browser notification. Once per fixture per page-load — a ref tracks what has
// already fired so re-refreshes don't spam.
export function useStreamWatch(
	fixtures: Fixture[],
	streams: StreamsByFixture[],
	isWatched: (fixtureId: string) => boolean,
) {
	const fired = useRef<Set<string>>(new Set());

	const maybeNotify = useCallback(async () => {
		if (!SUPPORTED || Notification.permission !== "granted") return;
		for (const fixture of fixtures) {
			if (!isLive(fixture) || !isWatched(fixture.id)) continue;
			if (fired.current.has(fixture.id)) continue;
			const links = streamsForFixture(streams, fixture.id);
			if (links.length === 0) continue;
			fired.current.add(fixture.id);
			new Notification(`${title(fixture)} — streams live!`, {
				body: `${links.length} stream link(s) available now.`,
			});
		}
	}, [fixtures, streams, isWatched]);

	return { maybeNotify, requestPermission: grant };
}

function title(fixture: Fixture): string {
	return `${fixture.homeTeam.shortName} vs ${fixture.awayTeam.shortName}`;
}