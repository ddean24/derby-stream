/**
 * Shared stream-link extraction helpers for the aggregator adapters.
 *
 * Every adapter (streamedpk, vipbox, …) normalises anchor hrefs to
 * absolute URLs and runs the same best-effort quality/language heuristics, so
 * these live here instead of being copy-pasted per site — one place to fix a
 * heuristic, one place to tighten the junk-URL filter.
 */

import type { StreamLink } from "@derby-streams/shared";

// Resolves an anchor href to an absolute URL. Returns null for junk (empty,
// "#", javascript:/mailto:/data:/tel: schemes). Relative hrefs are resolved
// against the page URL so downstream consumers always get a usable URL.
export function absolutise(href: string | undefined, pageUrl: string): string | null {
	if (href === undefined) return null;
	const trimmed = href.trim();
	if (!trimmed || trimmed === "#") return null;
	if (/^(javascript|mailto|data|tel|about|chrome):/i.test(trimmed)) return null;
	try {
		return new URL(trimmed, pageUrl).href;
	} catch {
		return null;
	}
}

const QUALITY_RE = /(\d{3,4})\s*p?|\b(4k|hd|sd)\b/i;

// Best-effort quality inference over an anchor's text + class attributes.
// Unknown values come back as null.
export function inferQuality(text: string): string | null {
	const match = text.match(QUALITY_RE);
	if (match === null) return null;
	const digits = match[1] ?? "";
	if (digits) return `${digits}p`;
	return (match[2] ?? "").toUpperCase();
}

const LANGUAGE_PATTERNS: ReadonlyArray<{ code: string; re: RegExp }> = [
	{ code: "eng", re: /\b(english|eng)\b/i },
	{ code: "esp", re: /\b(spanish|espa[ñn]ol|esp|es)\b/i },
	{ code: "por", re: /\b(portuguese|portugal)\b/i },
	{ code: "fra", re: /\b(french|fran[açc]ais)\b/i },
	{ code: "deu", re: /\b(german|deutsch)\b/i },
	{ code: "ita", re: /\b(italian|italiano)\b/i },
	{ code: "ara", re: /\b(arabic|arab)\b/i },
	{ code: "tur", re: /\b(turkish|t[uü]rk[çc]e)\b/i },
];

// Best-effort language inference over an anchor's text + class attributes.
// Unknown values come back as null.
export function inferLanguage(text: string): string | null {
	const match = LANGUAGE_PATTERNS.find(({ re }) => re.test(text));
	return match === undefined ? null : match.code;
}

export function dedupeByUrl(links: StreamLink[]): StreamLink[] {
	const seen = new Set<string>();
	const unique: StreamLink[] = [];
	for (const link of links) {
		if (seen.has(link.url)) continue;
		seen.add(link.url);
		unique.push(link);
	}
	return unique;
}
