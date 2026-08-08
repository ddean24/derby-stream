import { useEffect } from "react";
import { ArrowLeft, Bell, ChevronRight, Clock, Radio } from "lucide-react";
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
import { useCountdown } from "./useCountdown";
import { nextFixture, kickoffMs } from "./lib/countdown";
import type { ScrapeMeta } from "@derby-streams/shared";

const FOOTER_TIME = new Intl.DateTimeFormat(undefined, {
	day: "2-digit",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

function DataFooter({ meta }: { meta: ScrapeMeta | null }) {
	if (meta === null) return null;
	const when = new Date(meta.scrapedAt);
	const stale = !Number.isNaN(when.getTime()) && Date.now() - when.getTime() > 30 * 60 * 1000;

	return (
<footer className="px-6 pb-6 text-center text-xs text-slate-500">
			{Number.isNaN(when.getTime()) ? (
				<p>Last scrape: unknown</p>
			) : (
				<p>
					Data as of {FOOTER_TIME.format(when)}
					{stale && <span className="text-amber-400"> — may be stale</span>}
				</p>
			)}
			<p className="mt-0.5">
				{meta.fixturesCount} fixtures · {meta.streamsCount} scraped entries
			</p>
		</footer>
	);
}

interface FixtureSectionProps {
	title: string;
	fixtures: Fixture[];
	streams: StreamsByFixture[];
	isWatched: (fixtureId: string) => boolean;
	nextId?: string;
}

function FixtureSection({ title, fixtures, streams, isWatched, nextId }: FixtureSectionProps) {
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
						isNext={fixture.id === nextId}
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
	isNext?: boolean;
}

function FixtureRow({ fixture, streams, watched, isNext = false }: FixtureRowProps) {
	const score = formatScore(fixture.score);
	const streamLinks = streamsForFixture(streams, fixture.id);
	const live = isLive(fixture);

	return (
		<li className={isNext ? "bg-amber-500/10" : undefined}>
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
					<span className="min-w-0 flex-1">
						<span className="font-medium text-slate-100">{fixture.homeTeam.name}</span>
						<span className="text-slate-500"> vs </span>
						<span className="font-medium text-slate-100">{fixture.awayTeam.name}</span>
					</span>
					{isNext && !live && (
						<span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
							Next
						</span>
					)}
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

function NextMatchBanner({ fixtures }: { fixtures: Fixture[] }) {
	const next = nextFixture(fixtures);
	if (next === null) return null;

	const live = isLive(next);
	const kickoff = kickoffMs(next);
	const countdown = useCountdown(kickoff);
	const title = live ? "Live now" : "Up next";

	return (
		<a
			href={`#/match/${next.id}`}
			className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 transition-colors hover:bg-amber-500/15"
		>
			<span className="flex h-10 w-10 shrink-0 items-center justify-center">
				{live ? (
					<Radio className="h-6 w-6 text-amber-300" />
				) : (
					<Clock className="h-6 w-6 text-amber-300" />
				)}
			</span>
			<span className="min-w-0 text-sm">
				<span className="block text-xs font-semibold uppercase tracking-wider text-amber-300">{title}</span>
				<span className="block font-medium text-slate-100">
					{next.homeTeam.shortName} vs {next.awayTeam.shortName}
					<span className="ml-1 text-slate-400">({next.competition.code})</span>
				</span>
			</span>
			<span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-amber-200">
				{live ? "On now" : countdown !== null ? `T-${countdown}` : "soon"}
			</span>
		</a>
	);
}

export default function App() {
	const route = useHashRoute();
	const { status, fixtures, streams, history, meta, errorMessage, refresh } = useFixtures({
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
					<div>
						<FixtureDetail
							fixture={fixture}
							streams={streams}
							history={history}
							watched={isWatched(fixture.id)}
							onToggleWatch={() => toggle(fixture.id)}
							onRequestPermission={() => requestPermission()}
						/>
						<DataFooter meta={meta} />
					</div>
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
				<DataFooter meta={meta} />
			</main>
		);
	}

	const live = fixtures.filter(isLive);
	const upcoming = fixtures.filter(isUpcoming);
	const finished = fixtures.filter(isFinished).sort((a, b) => b.utcDate.localeCompare(a.utcDate));
	const next = nextFixture(fixtures);

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
						<NextMatchBanner fixtures={fixtures} />
						<FixtureSection title="Live" fixtures={live} streams={streams} isWatched={isWatched} nextId={next?.id} />
						<FixtureSection title="Upcoming" fixtures={upcoming} streams={streams} isWatched={isWatched} nextId={next?.id} />
						<FixtureSection title="Finished" fixtures={finished} streams={streams} isWatched={isWatched} nextId={next?.id} />
					</div>
				)}
			</div>
			<DataFooter meta={meta} />
		</main>
	);
}
