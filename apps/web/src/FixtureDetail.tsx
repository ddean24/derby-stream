import type { Fixture, StreamHistoryEntry, StreamLink, StreamsByFixture } from "@derby-streams/shared";
import { ArrowLeft, Bell, Check } from "lucide-react";
import EmptyState from "./components/EmptyState";
import StatusBadge from "./components/StatusBadge";
import TeamCrest from "./components/TeamCrest";
import { streamsForFixture } from "./data";
import { findDeadLinks, type DeadLink } from "./lib/deadLinks";
import { kickoffMs } from "./lib/countdown";
import { competitionBadgeClass, formatKickoffFull, formatScore, isFinished, isLive, sourceLabel } from "./lib/format";
import { useCountdown } from "./useCountdown";

interface FixtureDetailProps {
	fixture: Fixture;
	streams: StreamsByFixture[];
	history: StreamHistoryEntry[];
	watched: boolean;
	onToggleWatch: () => void;
	onRequestPermission?: () => Promise<boolean>;
}

interface StreamCardProps {
	link: StreamLink;
	fixtureId: string;
}

interface WatchButtonProps {
	watched: boolean;
	onToggle: () => void;
	onRequestPermission?: () => Promise<boolean>;
}

// Live-ticking countdown to kickoff, shown for upcoming fixtures next to the
// score block (ROADMAP 8.4). Hides once kickoff passes / match goes live.
function KickoffCountdown({ targetMs }: { targetMs: number }) {
	const countdown = useCountdown(targetMs);
	if (countdown === null) return null;
	return <p className="mt-2 text-xs font-semibold tabular-nums text-amber-300">T-{countdown}</p>;
}

// One archived snapshot: when it was captured and how many links were live.
// Used for finished fixtures so replays/broken links stay visible after the
// match (PLAN.md item 7.6).
function formatCaptureTime(at: string): string {
	const date = new Date(at);
	if (Number.isNaN(date.getTime())) return at;
	return new Intl.DateTimeFormat(undefined, {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

function HistoryTimeline({ history, deadLinks }: { history: StreamHistoryEntry[]; deadLinks: DeadLink[] }) {
	const snapshots = [...history].sort((a, b) => a.at.localeCompare(b.at));
	const deadByUrl = new Map(deadLinks.map((dead) => [dead.url, dead]));

	return (
		<section className="mt-8">
			<h2 className="mb-3 text-lg font-semibold text-slate-100">Stream history</h2>
			<p className="mb-3 text-sm text-slate-400">
				Snapshots of the links available during the match, oldest to newest. These are replays —
				some may no longer work after full time.
			</p>
			<ol className="space-y-3">
				{snapshots.map((snapshot, index) => (
					<li
						key={`${snapshot.at}-${index}`}
						className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
					>
						<p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
							{formatCaptureTime(snapshot.at)} · {snapshot.links.length} link
							{snapshot.links.length === 1 ? "" : "s"}
						</p>
						{snapshot.links.length > 0 ? (
							<ul className="mt-2 space-y-1">
								{snapshot.links.map((link) => {
									const dead = deadByUrl.get(link.url);
									return (
										<li
											key={`${snapshot.at}-${link.url}`}
											className={`flex items-center gap-2 text-sm ${dead !== undefined ? "text-slate-500" : ""}`}
										>
											<span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-semibold text-slate-300">
												{sourceLabel(link.source)}
											</span>
											<span className={`truncate min-w-0 ${dead ? "line-through" : "text-slate-300"}`}>
												{link.label}
											</span>
											{dead && (
												<span className="shrink-0 text-xs text-slate-500">
													went down
													{dead.diedAt !== null && (
														<>
															{" "}
															between {formatCaptureTime(dead.diedAt.present)}–{formatCaptureTime(dead.diedAt.absent)}
														</>
													)}
												</span>
											)}
										</li>
									);
								})}
							</ul>
						) : (
							<p className="mt-2 text-sm text-slate-500">No links found at this time.</p>
						)}
					</li>
				))}
			</ol>
		</section>
	);
}

function WatchButton({ watched, onToggle, onRequestPermission }: WatchButtonProps) {
	const handleClick = async () => {
		if (!watched && onRequestPermission !== undefined) {
			await onRequestPermission();
		}
		onToggle();
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
				watched
					? "border-emerald-600 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
					: "border-slate-700 text-slate-300 hover:bg-slate-800"
			}`}
		>
			{watched ? <Check className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
			{watched ? "Watching" : "Notify me"}
		</button>
	);
}

function StreamCard({ link, fixtureId }: StreamCardProps) {
	const meta = [link.quality, link.language].filter((value): value is string => value !== null).join(" · ");

	return (
		<li className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
			<div className="min-w-0">
				<p className="truncate font-medium text-slate-100">{link.label}</p>
				{meta.length > 0 && <p className="mt-0.5 text-xs text-slate-400">{meta}</p>}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-semibold text-slate-300">
					{sourceLabel(link.source)}
				</span>
				<a
					href={link.url}
					target="_blank"
					rel="noopener noreferrer"
					className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
				>
					Watch
				</a>
				<button
					type="button"
					onClick={() => {
						window.location.hash = `#/report/${fixtureId}`;
					}}
					title="Report this link as dead or broken"
					className="rounded border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800"
				>
					Link dead?
				</button>
			</div>
		</li>
	);
}

export default function FixtureDetail({
	fixture,
	streams,
	history,
	watched,
	onToggleWatch,
	onRequestPermission,
}: FixtureDetailProps) {
	const links = streamsForFixture(streams, fixture.id);
	const score = formatScore(fixture.score);
	const live = isLive(fixture);
	const countdownTarget = live ? NaN : kickoffMs(fixture);
	const fixtureHistory = history.filter((entry) => entry.fixtureId === fixture.id);
	const deadLinks = findDeadLinks(fixtureHistory, links, isFinished(fixture));

	return (
		<div className="mx-auto max-w-3xl px-6 py-6">
			<div className="flex items-center justify-between gap-4">
				<a
					href="#"
					onClick={(event) => {
						event.preventDefault();
						window.location.hash = "";
					}}
					className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-200"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to all fixtures
				</a>
				<WatchButton
					watched={watched}
					onToggle={onToggleWatch}
					onRequestPermission={onRequestPermission}
				/>
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-2">
				<span
					className={`rounded px-1.5 py-0.5 text-xs font-semibold ${competitionBadgeClass(
						fixture.competition.code,
					)}`}
				>
					{fixture.competition.code}
				</span>
				<p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
					{fixture.competition.name}
				</p>
			</div>
			<p className="mt-1 text-sm text-slate-400">{formatKickoffFull(fixture.utcDate)}</p>
			{!live && countdownTarget !== null && !Number.isNaN(countdownTarget) && countdownTarget > Date.now() && (
				<KickoffCountdown targetMs={countdownTarget} />
			)}

			<div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/50 px-6 py-5">
				<div className="min-w-0 flex-1">
					<TeamCrest team={fixture.homeTeam} className="h-10 w-10" />
					<p className="mt-1.5 truncate text-lg font-semibold text-slate-100">{fixture.homeTeam.name}</p>
					<p className="mt-0.5 text-sm text-slate-500">Home</p>
				</div>
				<div className="shrink-0 text-center">
					{score !== null ? (
						<p className="text-2xl font-bold tabular-nums text-slate-100">{score}</p>
					) : (
						<p className="text-sm font-medium text-slate-500">vs</p>
					)}
					<div className="mt-2">
						<StatusBadge fixture={fixture} />
					</div>
				</div>
				<div className="min-w-0 flex-1 text-right">
					<div className="flex justify-end">
						<TeamCrest team={fixture.awayTeam} className="h-10 w-10" />
					</div>
					<p className="mt-1.5 truncate text-lg font-semibold text-slate-100">{fixture.awayTeam.name}</p>
					<p className="mt-0.5 text-sm text-slate-500">Away</p>
				</div>
			</div>

			<section className="mt-8">
				<h2 className="mb-3 text-lg font-semibold text-slate-100">Streams</h2>
				{live && (
					<p className="mb-3 text-sm text-slate-400">
						This match is live — links refresh automatically as the data updates.
					</p>
				)}
				{links.length === 0 ? (
					<EmptyState title="No streams found yet" message="Stream links appear here closer to kickoff." />
				) : (
					<ul className="space-y-3">
						{links.map((link) => (
							<StreamCard key={link.url} link={link} fixtureId={fixture.id} />
						))}
					</ul>
				)}
			</section>

			{fixtureHistory.length > 0 && <HistoryTimeline history={fixtureHistory} deadLinks={deadLinks} />}
		</div>
	);
}
