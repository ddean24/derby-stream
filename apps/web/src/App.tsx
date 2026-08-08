import { useEffect } from "react";
import { ArrowLeft, Bell, ChevronRight } from "lucide-react";
import type { Fixture, StreamHistoryEntry, StreamsByFixture } from "@derby-streams/shared";
import CalendarView from "./components/CalendarView";
import EmptyState from "./components/EmptyState";
import ErrorState from "./components/ErrorState";
import Header from "./components/Header";
import Loading from "./components/Loading";
import StatusBadge from "./components/StatusBadge";
import { streamsForFixture } from "./data";
import FixtureDetail from "./FixtureDetail";
import {
	competitionBadgeClass,
	formatKickoff,
	formatScore,
	isFinished,
	isLive,
	isUpcoming,
} from "./lib/format";
import { useFixtures } from "./useFixtures";
import { useHashRoute } from "./useHashRoute";
import { useStreamWatch } from "./useNotify";
import { useWatchlist } from "./useWatchlist";

interface FixtureSectionProps {
	title: string;
	fixtures: Fixture[];
	streams: StreamsByFixture[];
	isWatched: (fixtureId: string) => boolean;
}

function FixtureSection({ title, fixtures, streams, isWatched }: FixtureSectionProps) {
	if (fixtures.length === 0) return null;

	return (
		<section>
			<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
			<ul className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/50">
				{fixtures.map((fixture) => (
					<FixtureRow
						key={fixture.id}
						fixture={fixture}
						streams={streams}
						watched={isWatched(fixture.id)}
					/>
				))}
			</ul>
		</section>
	);
}

interface FixtureRowProps {
	fixture: Fixture;
	streams: StreamsByFixture[];
	watched: boolean;
}

function FixtureRow({ fixture, streams, watched }: FixtureRowProps) {
	const score = formatScore(fixture.score);
	const streamLinks = streamsForFixture(streams, fixture.id);
	const live = isLive(fixture);

	return (
		<li>
			<a
				href={`#/match/${fixture.id}`}
				className="group block px-4 py-3 transition-colors hover:bg-slate-800/60 sm:flex sm:items-center sm:gap-3"
			>
				<div className="flex items-center gap-2 sm:shrink-0">
					<span className="whitespace-nowrap text-sm tabular-nums text-slate-400">
						{formatKickoff(fixture.utcDate)}
					</span>
					<span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${competitionBadgeClass(fixture.competition.code)}`}>
						{fixture.competition.code}
					</span>
				</div>
				<div className="mt-1 flex items-center gap-2 sm:mt-0 sm:min-w-0 sm:flex-1">
					<span className="min-w-0 flex-1 truncate">
						<span className="font-medium text-slate-100">{fixture.homeTeam.name}</span>
						<span className="text-slate-500"> vs </span>
						<span className="font-medium text-slate-100">{fixture.awayTeam.name}</span>
					</span>
					{watched && (
						<Bell
							className="h-4 w-4 shrink-0 text-emerald-400"
							fill="currentColor"
							aria-label="Watching"
						/>
					)}
					{score !== null && (
						<span className="shrink-0 text-sm font-semibold tabular-nums text-slate-200">{score}</span>
					)}
					{live && (
						<StatusBadge fixture={fixture}>
							{streamLinks.length > 0 && (
								<span className="font-semibold text-emerald-300">· {streamLinks.length}</span>
							)}
						</StatusBadge>
					)}
					<span className="shrink-0 text-slate-600 transition-colors group-hover:text-slate-300" aria-hidden="true">
						<ChevronRight className="h-4 w-4" />
					</span>
				</div>
			</a>
		</li>
	);
}

export default function App() {
	const route = useHashRoute();
	const { status, fixtures, streams, history, errorMessage, refresh } = useFixtures({
		autoRefresh: route.type === "match",
	});
	const { isWatched, toggle } = useWatchlist();
	const { maybeNotify, requestPermission } = useStreamWatch(
		status === "loaded" ? fixtures : [],
		status === "loaded" ? streams : [],
		isWatched,
	);

	// After every (re)load, ring any newly-available watched-stream notifications.
	useEffect(() => {
		if (status === "loaded") {
			void maybeNotify();
		}
	}, [status, maybeNotify]);

	if (status === "loading") {
		return (
			<main className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
				<Header />
				<div className="flex flex-1 items-center justify-center px-6 py-6">
					<Loading label="Loading fixtures…" />
				</div>
			</main>
		);
	}

	if (status === "error") {
		return (
			<main className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
				<Header />
				<div className="flex flex-1 items-center justify-center px-6 py-6">
					<ErrorState title="Failed to load fixtures" message={errorMessage} onRetry={refresh} />
				</div>
			</main>
		);
	}

	if (route.type === "match") {
		const fixture = fixtures.find((item) => item.id === route.fixtureId);
		return (
			<main className="min-h-screen bg-slate-950 text-slate-100">
				<Header />
				{fixture === undefined ? (
					<div className="mx-auto max-w-3xl px-6 py-6">
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
						<div className="mt-6">
							<EmptyState
								title="Fixture not found"
								message="This fixture isn't in the current data — it may have been removed."
							/>
						</div>
					</div>
				) : (
					<FixtureDetail
						fixture={fixture}
						streams={streams}
						history={history}
						watched={isWatched(fixture.id)}
						onToggleWatch={() => toggle(fixture.id)}
						onRequestPermission={() => requestPermission()}
					/>
				)}
			</main>
		);
	}

	if (route.type === "calendar") {
		return (
			<main className="min-h-screen bg-slate-950 text-slate-100">
				<Header />
				<div className="mx-auto max-w-3xl px-6 py-6">
					{fixtures.length === 0 ? (
						<EmptyState
							title="No fixtures found"
							message="Fixtures will appear here once the season schedule is published."
						/>
					) : (
						<CalendarView fixtures={fixtures} />
					)}
				</div>
			</main>
		);
	}

	const live = fixtures.filter(isLive);
	const upcoming = fixtures.filter(isUpcoming);
	const finished = fixtures.filter(isFinished).sort((a, b) => b.utcDate.localeCompare(a.utcDate));

	return (
		<main className="min-h-screen bg-slate-950 text-slate-100">
			<Header />
			<div className="mx-auto max-w-3xl px-6 py-6">
				{fixtures.length === 0 ? (
					<EmptyState
						title="No fixtures found"
						message="Fixtures will appear here once the season schedule is published."
					/>
				) : (
					<div className="space-y-6">
						<FixtureSection title="Live" fixtures={live} streams={streams} isWatched={isWatched} />
						<FixtureSection title="Upcoming" fixtures={upcoming} streams={streams} isWatched={isWatched} />
						<FixtureSection title="Finished" fixtures={finished} streams={streams} isWatched={isWatched} />
					</div>
				)}
			</div>
		</main>
	);
}
