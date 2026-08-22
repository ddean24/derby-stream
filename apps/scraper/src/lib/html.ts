import { load, type CheerioAPI } from "cheerio";
import { HttpStatusError, NetworkError } from "../errors.ts";

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_RETRIES = 2;
export const RETRY_DELAY_MS = 1_000;

export const DEFAULT_USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export interface FetchHtmlOptions {
	url: string;
	timeoutMs?: number;
	headers?: Record<string, string>;
	retries?: number;
	delayMs?: number;
	userAgent?: string;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtml(opts: FetchHtmlOptions): Promise<string> {
	if (opts.delayMs !== undefined && opts.delayMs > 0) {
		await sleep(opts.delayMs);
	}

	const headers = {
		"User-Agent": opts.userAgent ?? DEFAULT_USER_AGENT,
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
		"Accept-Language": "en-GB,en;q=0.9",
		...opts.headers,
	};
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const retries = opts.retries ?? DEFAULT_RETRIES;

	let lastCause: unknown = undefined;
	for (let attempt = 0; ; attempt++) {
		try {
			const res = await fetch(opts.url, { headers, signal: AbortSignal.timeout(timeoutMs) });
			if (!res.ok) {
				throw new HttpStatusError(res.status, `GET ${opts.url} returned HTTP ${res.status}`);
			}
			return await res.text();
		} catch (cause) {
			if (cause instanceof HttpStatusError) {
				throw cause;
			}
			lastCause = cause;
			if (attempt >= retries) {
				break;
			}
			await sleep(RETRY_DELAY_MS);
		}
	}

	throw new NetworkError(`failed to fetch ${opts.url} after ${retries + 1} attempt(s)`, { cause: lastCause });
}

export function parseHtml(html: string): CheerioAPI {
	return load(html);
}

// Best-effort wrapper kept for callers (e.g. cupFixtures.ts) that want a single
// fetch entry point. Historically this retried a blocked page via a headless
// browser; the scraper no longer depends on Playwright, so it is now a thin
// alias over fetchHtml.
export async function fetchHtmlBestEffort(opts: FetchHtmlOptions): Promise<string> {
	return await fetchHtml(opts);
}
