import type { StreamHistoryEntry, StreamLink } from "@derby-streams/shared";

// Dead/expired link detection (ROADMAP 8.5).
//
// For a FINISHED fixture, intersect the archived history snapshots with the
// current `streams.json` state: any URL present in the history but absent from
// the current snapshot has gone down since. The history timeline then renders
// such links struck through + muted, with an optional "died between X–Y" tag
// derived from the first snapshot that lacked the link after its last sighting.
//
// `history` must already be scoped to the fixture in question.
export interface DeadLink {
	url: string;
	label: string;
	diedAt: { present: string; absent: string } | null;
}

export function findDeadLinks(
	history: readonly StreamHistoryEntry[],
	currentLinks: readonly StreamLink[],
	finished: boolean,
): DeadLink[] {
	if (!finished) return [];

	const currentUrls = new Set(currentLinks.map((link) => link.url));

	// Track each URL's last-seen snapshot and the first snapshot where it went
	// missing. Walk chronologically so present→absent gives the death window.
	const lastSeen = new Map<string, string>();
	const firstAbsent = new Map<string, string>();
	const labelByUrl = new Map<string, string>();

	const snapshots = [...history].sort((a, b) => a.at.localeCompare(b.at));

	for (const snapshot of snapshots) {
		const presentUrls = new Set(snapshot.links.map((link) => link.url));
		for (const link of snapshot.links) {
			labelByUrl.set(link.url, link.label);
			if (!firstAbsent.has(link.url)) {
				lastSeen.set(link.url, snapshot.at);
			}
		}
		for (const url of [...lastSeen.keys()]) {
			if (!presentUrls.has(url) && !firstAbsent.has(url)) {
				firstAbsent.set(url, snapshot.at);
			}
		}
	}

	const dead: DeadLink[] = [];
	for (const [url, label] of labelByUrl) {
		if (currentUrls.has(url)) continue;
		const seenAt = lastSeen.get(url);
		const goneAt = firstAbsent.get(url);
		dead.push({
			url,
			label,
			diedAt: seenAt !== undefined && goneAt !== undefined ? { present: seenAt, absent: goneAt } : null,
		});
	}
	return dead;
}