import { load, type CheerioAPI } from "cheerio";
import type { Browser } from "playwright";
import { HttpStatusError, NetworkError, PlaywrightError } from "../errors.ts";

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

export async function fetchHtmlWithPlaywright(opts: FetchHtmlOptions): Promise<string> {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	let browser: Browser | undefined;

	try {
		const { chromium } = await import("playwright");
		browser = await chromium.launch({ headless: true });
		const page = await browser.newPage({ userAgent: opts.userAgent ?? DEFAULT_USER_AGENT });
		await page.goto(opts.url, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
		return await page.content();
	} catch (cause) {
		throw new PlaywrightError(`Playwright fallback failed for ${opts.url}`, { cause });
	} finally {
		if (browser !== undefined) {
			await browser.close().catch(() => {});
		}
	}
}

export async function fetchHtmlBestEffort(opts: FetchHtmlOptions): Promise<string> {
	try {
		return await fetchHtml(opts);
	} catch (cause) {
		// Non-2xx may be a bot-block (e.g. Cloudflare 403) rather than a hard miss, so retry via the browser.
		if (cause instanceof HttpStatusError || cause instanceof NetworkError) {
			return await fetchHtmlWithPlaywright(opts);
		}
		throw cause;
	}
}
