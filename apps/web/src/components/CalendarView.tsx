import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { Fixture } from "@derby-streams/shared";
import { downloadIcs } from "../lib/ics";
import { competitionBadgeClass, formatKickoff, formatScore, isLive } from "../lib/format";
import StatusBadge from "./StatusBadge";

interface CalendarViewProps {
	fixtures: Fixture[];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

const DAY_NAMES = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	day: "numeric",
	month: "long",
});

function dayKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate(),
	).padStart(2, "0")}`;
}

function fixturesOnDay(fixtures: Fixture[], key: string): Fixture[] {
	return fixtures.filter((fixture) => dayKey(new Date(fixture.utcDate)) === key);
}

// Cells in calendar order: grid starts on the Monday of (or before) the month's
// first day and always pads out to a full week (42 cells).
function monthCells(year: number, month: number): Date[] {
	const firstOfMonth = new Date(year, month, 1);
	const mondayIndex = (firstOfMonth.getDay() + 6) % 7; // Mon=0 … Sun=6
	const start = new Date(year, month, 1 - mondayIndex);
	const cells: Date[] = [];
	for (let i = 0; i < 42; i += 1) {
		cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
	}
	return cells;
}

// Mobile-only agenda: one full-width row per match, grouped under its day.
// The 7-column grid doesn't leave room for teams/status on phones, so below lg
// we drop it in favour of a day-by-day list.
interface MobileAgendaProps {
	fixtures: Fixture[];
	viewYear: number;
	viewMonth: number;
}

function MobileAgenda({ fixtures, viewYear, viewMonth }: MobileAgendaProps) {
	const days = useMemo(() => {
		const daysOnMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const groups: { key: string; date: Date; fixtures: Fixture[] }[] = [];
		for (let day = 1; day <= daysOnMonth; day += 1) {
			const date = new Date(viewYear, viewMonth, day);
			const key = dayKey(date);
			const dayFixtures = fixturesOnDay(fixtures, key).sort((a, b) =>
				a.utcDate.localeCompare(b.utcDate),
			);
			if (dayFixtures.length > 0) {
				groups.push({ key, date, fixtures: dayFixtures });
			}
		}
		return groups;
	}, [fixtures, viewYear, viewMonth]);

	if (days.length === 0) {
		return (
			<p className="py-6 text-center text-sm text-slate-500 lg:hidden">
				No fixtures in this month.
			</p>
		);
	}

	return (
		<div className="space-y-6 lg:hidden">
			{days.map(({ key, date, fixtures: dayFixtures }) => (
				<section key={key}>
					<h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
						{DAY_NAMES.format(date)}
					</h3>
					<ul className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/50">
						{dayFixtures.map((fixture) => {
							const score = formatScore(fixture.score);
							const live = isLive(fixture);
							return (
								<li key={fixture.id}>
									<a
										href={`#/match/${fixture.id}`}
										className="group block px-4 py-3 transition-colors hover:bg-slate-800/60"
									>
										<div className="flex items-center gap-2">
											<span className="whitespace-nowrap text-sm tabular-nums text-slate-400">
												{formatKickoff(fixture.utcDate)}
											</span>
											<span
												className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${competitionBadgeClass(
													fixture.competition.code,
												)}`}
											>
												{fixture.competition.code}
											</span>
										</div>
										<div className="mt-1 flex items-center gap-2">
											<span className="min-w-0 flex-1 truncate">
												<span className="font-medium text-slate-100">{fixture.homeTeam.name}</span>
												<span className="text-slate-500"> vs </span>
												<span className="font-medium text-slate-100">{fixture.awayTeam.name}</span>
											</span>
											{score !== null && (
												<span className="shrink-0 text-sm font-semibold tabular-nums text-slate-200">
													{score}
												</span>
											)}
											{live && <StatusBadge fixture={fixture} />}
										</div>
									</a>
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}

export default function CalendarView({ fixtures }: CalendarViewProps) {
	const today = new Date();
	const [viewYear, setViewYear] = useState(today.getFullYear());
	const [viewMonth, setViewMonth] = useState(today.getMonth());

	const cells = useMemo(() => monthCells(viewYear, viewMonth), [viewYear, viewMonth]);

	const inViewMonth = (date: Date) => date.getMonth() === viewMonth;
	const todayKey = dayKey(today);

	const shiftMonth = (delta: number) => {
		const date = new Date(viewYear, viewMonth + delta, 1);
		setViewYear(date.getFullYear());
		setViewMonth(date.getMonth());
	};

	const goToToday = () => {
		setViewYear(today.getFullYear());
		setViewMonth(today.getMonth());
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-xl font-semibold text-slate-100">
					{MONTH_NAMES.format(new Date(viewYear, viewMonth, 1))}
				</h2>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={goToToday}
						className="text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-200"
					>
						Today
					</button>
					<div className="flex items-center gap-1">
						<button
							type="button"
							aria-label="Previous month"
							onClick={() => shiftMonth(-1)}
							className="rounded border border-slate-800 px-2.5 py-1 text-slate-300 transition-colors hover:bg-slate-800/60"
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<button
							type="button"
							aria-label="Next month"
							onClick={() => shiftMonth(1)}
							className="rounded border border-slate-800 px-2.5 py-1 text-slate-300 transition-colors hover:bg-slate-800/60"
						>
							<ChevronRight className="h-4 w-4" />
						</button>
					</div>
					<button
						type="button"
						onClick={() => downloadIcs(fixtures)}
						className="inline-flex items-center gap-1.5 rounded border border-slate-800 px-2.5 py-1 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/60 hover:text-slate-100"
					>
						<Download className="h-4 w-4" />
						Export .ics
					</button>
				</div>
			</div>

			<div className="hidden rounded-lg border border-slate-800 bg-slate-900/50 lg:block">
				<div className="grid grid-cols-7 border-b border-slate-800">
					{WEEKDAYS.map((weekday) => (
						<div
							key={weekday}
							className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500"
						>
							{weekday}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7">
					{cells.map((date) => {
						const key = dayKey(date);
						const dayFixtures = fixturesOnDay(fixtures, key);
						const isToday = key === todayKey;

						return (
							<div
								key={key}
								className={`min-h-24 border-b border-r border-slate-800/60 p-1.5 ${
									inViewMonth(date) ? "" : "bg-slate-950/60"
								}`}
							>
								<div className="flex items-center justify-between gap-1">
									<span
										className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
											isToday
												? "bg-emerald-500 text-slate-950"
												: inViewMonth(date)
													? "text-slate-300"
													: "text-slate-600"
										}`}
									>
										{date.getDate()}
									</span>
								</div>
								<div className="mt-1 space-y-1">
									{dayFixtures.map((fixture) => (
										<a
											key={fixture.id}
											href={`#/match/${fixture.id}`}
											className="block rounded bg-slate-800 px-1.5 py-1 text-xs text-slate-200 transition-colors hover:bg-slate-700"
										>
											<span className="flex items-center justify-between gap-1 font-medium">
												<span className="truncate">
													{fixture.homeTeam.shortName} vs {fixture.awayTeam.shortName}
												</span>
												<span
													className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold ${competitionBadgeClass(
														fixture.competition.code,
													)}`}
												>
													{fixture.competition.code}
												</span>
												<StatusBadge fixture={fixture} />
											</span>
										</a>
									))}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<MobileAgenda fixtures={fixtures} viewYear={viewYear} viewMonth={viewMonth} />
		</div>
	);
}