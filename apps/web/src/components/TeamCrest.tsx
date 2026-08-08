import { useState } from "react";
import type { Team } from "@derby-streams/shared";

interface TeamCrestProps {
	team: Team;
	className?: string;
}

// Initials for the monogram fallback: first letters of the first two words,
// uppercased; a single-word name uses its first two letters.
function monogram(shortName: string): string {
	const words = shortName.trim().split(/\s+/).filter((word) => word.length > 0);
	if (words.length === 0) return "?";
	const first = words[0] ?? "";
	if (words.length === 1) return first.slice(0, 2).toUpperCase();
	return (words[0] ?? "").charAt(0).toUpperCase() + (words[1] ?? "").charAt(0).toUpperCase();
}

// Team crest with graceful monogram fallback (ROADMAP.md item 8.7). The crest is
// a self-hosted relative path (e.g. "crests/342.svg") pointing at dist/crests/;
// when the team has none, the file 404s, or the fetch errors, we show a neutral
// circular monogram instead of a broken image.
export default function TeamCrest({ team, className }: TeamCrestProps) {
	const [errored, setErrored] = useState(false);

	if (team.crest && !errored) {
		return (
			<img
				src={team.crest}
				alt={`${team.shortName} crest`}
				loading="lazy"
				className={className}
				onError={() => setErrored(true)}
			/>
		);
	}

	return (
		<span
			aria-hidden="true"
			className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-300 sm:h-6 sm:w-6"
		>
			{monogram(team.shortName)}
		</span>
	);
}