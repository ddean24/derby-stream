import type { ReactNode } from "react";
import type { Fixture } from "@derby-streams/shared";
import { isLive, statusLabel } from "../lib/format";

interface StatusBadgeProps {
	fixture: Fixture;
	children?: ReactNode;
}

export default function StatusBadge({ fixture, children }: StatusBadgeProps) {
	const label = statusLabel(fixture.status);

	if (isLive(fixture)) {
		return (
			<span className="inline-flex shrink-0 items-center gap-1.5 rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-400">
				<span className="relative flex h-1.5 w-1.5" aria-hidden="true">
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
					<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
				</span>
				{label}
				{children}
			</span>
		);
	}

	return (
		<span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">{label}</span>
	);
}
