import type { Fixture, StreamsByFixture } from "@derby-streams/shared";
import { streamsForFixture } from "./data";
import { formatKickoff, formatScore, isFinished, isLive, isUpcoming } from "./lib/format";
import { useFixtures } from "./useFixtures";

interface FixtureSectionProps {
	title: string;
	fixtures: Fixture[];
	streams: StreamsByFixture[];
}

function FixtureSection({ title, fixtures, streams }: FixtureSectionProps) {
	if (fixtures.length === 0) return null;

	return (
		<section>
			<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
			<ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/50">
				{fixtures.map((fixture) => (
					<FixtureRow key={fixture.id} fixture={fixture} streams={streams} />
				))}
			</ul>
		</section>
	);
}

interface FixtureRowProps {
	fixture: Fixture;
	streams: StreamsByFixture[];
}

function FixtureRow({ fixture, streams }: FixtureRowProps) {
	const score = formatScore(fixture.score);
	const streamLinks = streamsForFixture(streams, fixture.id);
	const live = isLive(fixture);

	return (
		<li className="flex items-center gap-3 px-4 py-3">
			<span className="w-28 shrink-0 text-sm tabular-nums text-slate-400">{formatKickoff(fixture.utcDate)}</span>
			<span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-xs font-semibold text-slate-300">
				{fixture.competition.code}
			</span>
			<span className="min-w-0 flex-1 truncate">
				<span className="font-medium text-slate-100">{fixture.homeTeam.name}</span>
				<span className="text-slate-500"> vs </span>
				<span className="font-medium text-slate-100">{fixture.awayTeam.name}</span>
			</span>
			{score !== null && (
				<span className="shrink-0 text-sm font-semibold tabular-nums text-slate-200">{score}</span>
			)}
			{live && (
				<span className="inline-flex shrink-0 items-center gap-1.5 rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
					LIVE
					{streamLinks.length > 0 && <span className="font-semibold text-emerald-300">· {streamLinks.length}</span>}
				</span>
			)}
		</li>
	);
}

export default function App() {
	const { status, fixtures, streams, errorMessage, refresh } = useFixtures();

	if (status === "loading") {
		return (
			<main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
				<p className="text-slate-400">Loading fixtures…</p>
			</main>
		);
	}

	if (status === "error") {
		return (
			<main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
				<div className="text-center">
					<h1 className="text-2xl font-bold">Derby Streams</h1>
					<p className="mt-4 text-slate-400">Failed to load fixtures.</p>
					<p className="mt-1 text-sm text-red-400">{errorMessage}</p>
					<button
						type="button"
						onClick={refresh}
						className="mt-4 rounded bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
					>
						Retry
					</button>
				</div>
			</main>
		);
	}

	const live = fixtures.filter(isLive);
	const upcoming = fixtures.filter(isUpcoming);
	const finished = fixtures.filter(isFinished).sort((a, b) => b.utcDate.localeCompare(a.utcDate));

	return (
		<main className="min-h-screen bg-slate-950 text-slate-100">
			<header className="border-b border-slate-800 px-6 py-4">
				<h1 className="text-2xl font-bold">Derby Streams</h1>
			</header>
			<div className="mx-auto max-w-3xl px-6 py-6">
				{fixtures.length === 0 ? (
					<p className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-8 text-center text-slate-400">
						No fixtures found.
					</p>
				) : (
					<div className="space-y-6">
						<FixtureSection title="Live" fixtures={live} streams={streams} />
						<FixtureSection title="Upcoming" fixtures={upcoming} streams={streams} />
						<FixtureSection title="Finished" fixtures={finished} streams={streams} />
					</div>
				)}
			</div>
		</main>
	);
}
