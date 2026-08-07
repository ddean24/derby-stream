import type { Fixture, Team } from "@derby-streams/shared";

// Team-name normalisation rules:
// - lowercase everything
// - strip dots entirely ("Derby County F.C." -> "Derby County FC")
// - map hyphens to a space ("West-Ham United" -> "West Ham United")
// - collapse runs of whitespace to a single space, then trim
// - drop whole-word legal-suffix tokens ("fc", "afc", "cf") wherever they
//   appear, so "Derby County FC" and "Derby County F.C." == "Derby County"
// - deliberately KEEP every other word (city/united/county included) so
//   "Manchester City" and "Manchester United" never collapse together
//
// The token produced is meant to be compared via substring, e.g. a normalised
// listing "derby vs west ham united" contains the token "west ham united".
const SUFFIX_TOKENS = new Set(["fc", "afc", "cf"]);

// Words that appear in listings but are never team names; used only by the
// debug helper extractTeamNames.
const LISTING_SEPARATORS = new Set(["vs", "v", "at", "&", "and", "w"]);

export function normaliseTeamName(raw: string): string {
	const lower = raw.toLowerCase();
	const noDots = lower.replace(/\./g, "");
	const spaced = noDots.replace(/-/g, " ");
	const collapsed = spaced.replace(/\s+/g, " ").trim();
	const words = collapsed
		.split(" ")
		.filter((word) => word.length > 0 && !SUFFIX_TOKENS.has(word));
	return words.join(" ");
}

export function normaliseFixtureTeamNames(fixture: Fixture): { home: string; away: string } {
	return {
		home: normaliseTeamName(displayName(fixture.homeTeam)),
		away: normaliseTeamName(displayName(fixture.awayTeam)),
	};
}

// A team may be listed on a site by its full name ("Derby County") or its
// short name ("Derby"), so a side is considered present in a listing when
// either normalised form appears as a substring.
function sideTokens(team: Team): string[] {
	const tokens = [normaliseTeamName(team.name), normaliseTeamName(team.shortName)];
	return [...new Set(tokens.filter((token) => token.length > 0))];
}

export function matchFixtureToListing(opts: { fixture: Fixture; listingText: string }): boolean {
	const { fixture, listingText } = opts;
	const listing = normaliseTeamName(listingText);
	return (
		sideTokens(fixture.homeTeam).some((token) => listing.includes(token)) &&
		sideTokens(fixture.awayTeam).some((token) => listing.includes(token))
	);
}

// Normalised individual words found in a listing line; handy for debugging why
// a match did or did not occur.
export function extractTeamNames(listingText: string): string[] {
	const words = normaliseTeamName(listingText).split(" ");
	return [...new Set(words.filter((word) => word.length > 0 && !LISTING_SEPARATORS.has(word)))];
}

function displayName(team: Team): string {
	const name = team.name.trim();
	return name.length > 0 ? name : team.shortName;
}
