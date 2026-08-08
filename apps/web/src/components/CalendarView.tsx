import { useMemo, useState } from "react";
import type { Fixture } from "@derby-streams/shared";
import { downloadIcs } from "../lib/ics";
import StatusBadge from "./StatusBadge";

interface CalendarViewProps {
	fixtures: Fixture[];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

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
							className="rounded border border-slate-800 px-2.5 py-1 text-sm text-slate-300 transition-colors hover:bg-slate-800/60"
						>
							←
						</button>
						<button
							type="button"
							aria-label="Next month"
							onClick={() => shiftMonth(1)}
							className="rounded border border-slate-800 px-2.5 py-1 text-sm text-slate-300 transition-colors hover:bg-slate-800/60"
						>
							→
						</button>
					</div>
					<button
						type="button"
						onClick={() => downloadIcs(fixtures)}
						className="rounded border border-slate-800 px-2.5 py-1 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/60 hover:text-slate-100"
					>
						Export .ics
					</button>
				</div>
			</div>

			<div className="rounded-lg border border-slate-800 bg-slate-900/50">
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
		</div>
	);
}