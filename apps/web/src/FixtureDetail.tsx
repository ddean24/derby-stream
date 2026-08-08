import type { Fixture, StreamLink, StreamsByFixture } from "@derby-streams/shared";
import EmptyState from "./components/EmptyState";
import StatusBadge from "./components/StatusBadge";
import { streamsForFixture } from "./data";
import { formatKickoffFull, formatScore, isLive, sourceLabel } from "./lib/format";

interface FixtureDetailProps {
	fixture: Fixture;
	streams: StreamsByFixture[];
}

interface StreamCardProps {
	link: StreamLink;
}

function StreamCard({ link }: StreamCardProps) {
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
			</div>
		</li>
	);
}

export default function FixtureDetail({ fixture, streams }: FixtureDetailProps) {
	const links = streamsForFixture(streams, fixture.id);
	const score = formatScore(fixture.score);
	const live = isLive(fixture);

	return (
		<div className="mx-auto max-w-3xl px-6 py-6">
			<a
				href="#"
				onClick={(event) => {
					event.preventDefault();
					window.location.hash = "";
				}}
				className="text-sm font-medium text-slate-400 hover:text-slate-200"
			>
				← Back to all fixtures
			</a>

			<div className="mt-4">
				<p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
					{fixture.competition.name}
				</p>
				<p className="mt-1 text-sm text-slate-400">{formatKickoffFull(fixture.utcDate)}</p>
			</div>

			<div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/50 px-6 py-5">
				<div className="min-w-0 flex-1">
					<p className="truncate text-lg font-semibold text-slate-100">{fixture.homeTeam.name}</p>
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
					<p className="truncate text-lg font-semibold text-slate-100">{fixture.awayTeam.name}</p>
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
							<StreamCard key={link.url} link={link} />
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
