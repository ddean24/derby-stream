import type { Fixture, FixtureStatus, StreamSource } from "@derby-streams/shared";

const LIVE_STATUSES = new Set<FixtureStatus>(["IN_PLAY", "PAUSED"]);

export function formatKickoff(utcDate: string): string {
	const date = new Date(utcDate);
	if (Number.isNaN(date.getTime())) return utcDate;
	return new Intl.DateTimeFormat(undefined, {
		weekday: "short",
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

export function formatScore(score: Fixture["score"]): string | null {
	if (score === null) return null;
	if (typeof score.home !== "number" || typeof score.away !== "number") return null;
	return `${score.home}-${score.away}`;
}

export function isLive(fixture: Fixture): boolean {
	return LIVE_STATUSES.has(fixture.status);
}

export function isFinished(fixture: Fixture): boolean {
	return fixture.status === "FINISHED";
}

export function isUpcoming(fixture: Fixture): boolean {
	return !isLive(fixture) && !isFinished(fixture);
}

export function isLiveOrUpcoming(fixture: Fixture): boolean {
	return !isFinished(fixture);
}

export function formatKickoffFull(utcDate: string): string {
	const date = new Date(utcDate);
	if (Number.isNaN(date.getTime())) return utcDate;
	return new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		day: "2-digit",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

const SOURCE_LABELS: Record<StreamSource, string> = {
	totalsportek: "Total Sportek",
	soccerstreams: "Soccer Streams",
	footybite: "FootyBite",
	hesgoal: "HesGoal",
};

export function sourceLabel(source: StreamSource): string {
	return SOURCE_LABELS[source];
}

const STATUS_LABELS: Record<FixtureStatus, string> = {
	SCHEDULED: "Scheduled",
	TIMED: "Timed",
	IN_PLAY: "Live",
	PAUSED: "Paused",
	FINISHED: "FT",
	CANCELLED: "Cancelled",
	POSTPONED: "Postponed",
};

export function statusLabel(status: FixtureStatus): string {
	return STATUS_LABELS[status];
}
