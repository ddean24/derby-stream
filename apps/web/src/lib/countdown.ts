import type { Fixture } from "@derby-streams/shared";
import { isLive } from "./format";

// Unpadded to keep "4:02" and "0:59" tidy below the hour, padded to HH:MM:SS
// at/above it (roadmap asks for HH:MM:SS on the detail page).
export function formatCountdown(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		const hh = String(hours).padStart(2, "0");
		const mm = String(minutes).padStart(2, "0");
		const ss = String(seconds).padStart(2, "0");
		return `${hh}:${mm}:${ss}`;
	}
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function kickoffMs(fixture: Fixture): number {
	const time = new Date(fixture.utcDate).getTime();
	return Number.isNaN(time) ? NaN : time;
}

// The "next" fixture for the pinned banner + row highlight (ROADMAP 8.4):
//   - a live fixture, if any (it is what's on right now → "Live"),
//   - otherwise the upcoming kickoff with the earliest future time,
//   - otherwise null (nothing playable ahead).
// A live match wins even if its kickoff is in the past; the banner then reads
// "Live" rather than a T-minus countdown.
export function nextFixture(fixtures: readonly Fixture[]): Fixture | null {
	const live = fixtures.find(isLive);
	if (live !== undefined) return live;

	const upNext = fixtures
		.map((fixture) => ({ fixture, kickoff: kickoffMs(fixture) }))
		.filter(({ kickoff }) => !Number.isNaN(kickoff) && kickoff >= Date.now())
		.sort((a, b) => a.kickoff - b.kickoff)
		.at(0);

	return upNext?.fixture ?? null;
}