import type { ScrapeMeta } from "@derby-streams/shared";

// The scraper runs on a fixed cron (*/15 every hour) at the :00/:15/:30/:45
// marks, so the next refresh is the next quarter-hour boundary strictly AFTER
// the last scrape (a run that finished exactly at 14:15:00 pre-empts the
// 14:15 run's data in the repo, but the 14:15 cron itself still fires next;
// the 14:30 one is the one that can change anything).
export const REFRESH_CYCLE_MS = 15 * 60 * 1000

export function nextRefreshTime(meta: ScrapeMeta | null): Date | null {
	if (meta === null) return null
	const scrapedMs = new Date(meta.scrapedAt).getTime()
	if (Number.isNaN(scrapedMs)) return null
	const boundary = Math.floor(scrapedMs / REFRESH_CYCLE_MS) * REFRESH_CYCLE_MS + REFRESH_CYCLE_MS
	return new Date(boundary)
}