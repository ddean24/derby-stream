/**
 * Recurring aggregator smoke test (ROADMAP.md item 8.6).
 *
 * A non-matchday safety net: instead of only exercising the aggregators while a
 * Derby game is live, it hits every URL in SITES (config.ts) on a schedule and
 * asserts the homepage is still fetchable, parseable, and has a minimal nav
 * pattern. It is driven entirely off SITES so URL maintenance stays in exactly
 * one place, and it reuses fetchHtml — the same network stack the real adapters
 * use — so "what we can reach" means "what the scraper can reach". No Playwright
 * here: keep the health path fast and dependency-light.
 *
 * Fails loudly but checks EVERY site (no short-circuit): checkHealth() collects
 * per-site pass/fail into a HealthReport, and the CLI (`start health` in
 * src/index.ts) exits non-zero when any site fails, naming the culprits. On
 * failure it also pings Slack via the existing SLACK_WEBHOOK_URL no-op pattern
 * (see notify.ts/alerts.ts): unset webhook -> log and skip, exit code unchanged.
 */

import { STREAM_SOURCES } from "@derby-streams/shared";
import type { StreamSource } from "@derby-streams/shared";
import { SITES } from "./config.ts";
import { HttpStatusError } from "./errors.ts";
import { fetchHtml, parseHtml } from "./lib/html.ts";
import type { FetchHtmlOptions } from "./lib/html.ts";

export interface SiteHealth {
	source: StreamSource;
	url: string;
	ok: boolean;
	// HTTP status when the failure was a non-2xx response (else undefined).
	status?: number;
	error?: string;
}

export interface HealthReport {
	sites: SiteHealth[];
	failures: SiteHealth[];
	passed: boolean;
}

export interface CheckHealthOptions {
	fetchHtml?: typeof fetchHtml;
}

const SLACK_POST_TIMEOUT_MS = 10_000;
const SLACK_WEBHOOK_URL: string = process.env.SLACK_WEBHOOK_URL ?? "";

function causeMessage(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

async function checkSite(
	fetcher: (opts: FetchHtmlOptions) => Promise<string>,
	source: StreamSource,
	url: string,
): Promise<SiteHealth> {
	let html: string;
	try {
		html = await fetcher({ url });
	} catch (cause) {
		// HttpStatusError carries the HTTP status; anything else (NetworkError,
		// the injected fake, ...) is reported by message alone.
		if (cause instanceof HttpStatusError) {
			return { source, url, ok: false, status: cause.status, error: cause.message };
		}
		return { source, url, ok: false, error: causeMessage(cause) };
	}

	const anchors = parseHtml(html)("a[href]");
	if (anchors.length === 0) {
		return {
			source,
			url,
			ok: false,
			error: "page returned but contains no <a href> anchors (bot-challenge shell?)",
		};
	}
	return { source, url, ok: true };
}

// Site checks run SEQUENTIALLY (not Promise.all), mirroring the real scraper's
// politeness toward rate-limit-sensitive aggregators (see streams.ts). Every
// source is still checked even after a failure — no short-circuit.
export async function checkHealth(opts: CheckHealthOptions = {}): Promise<HealthReport> {
	const fetcher = opts.fetchHtml ?? fetchHtml;
	const sites: SiteHealth[] = [];
	for (const source of STREAM_SOURCES) {
		for (const url of SITES[source]) {
			sites.push(await checkSite(fetcher, source, url));
		}
	}
	const failures = sites.filter((site) => !site.ok);
	return { sites, failures, passed: failures.length === 0 };
}

// Compact per-site summary, one line each (OK/FAIL + status or error), plus a
// coarse overall FAIL line — surfaced on stdout by the CLI.
export function formatHealthSummary(report: HealthReport): string {
	const lines = report.sites.map((site) => {
		if (site.ok) {
			return `  [OK] ${site.source} ${site.url}`;
		}
		const reason = site.status !== undefined ? `HTTP ${site.status}` : site.error ?? "failed";
		return `  [FAIL] ${site.source} ${site.url} — ${reason}`;
	});

	if (report.failures.length === 0) {
		const count = report.sites.length;
		lines.push(`All ${count} aggregator site(s) healthy.`);
	} else {
		const names = report.failures.map((site) => site.source).join(", ");
		lines.push(
			`${report.failures.length}/${report.sites.length} aggregator site(s) UNHEALTHY: ${names}`,
		);
	}
	return lines.join("\n");
}

// Best-effort Slack failure ping using the repo's existing no-op pattern:
// empty SLACK_WEBHOOK_URL -> log and skip; a delivery error is logged but never
// changes the caller's exit code (the site failures are the real signal).
export async function notifySlackOnFailure(
	report: HealthReport,
	webhookUrl: string = SLACK_WEBHOOK_URL,
): Promise<void> {
	if (webhookUrl === "") {
		console.log("[health] SLACK_WEBHOOK_URL not set; skipping failure alert");
		return;
	}
	const text = [
		`*derby-streams health check FAILED* (${report.failures.length}/${report.sites.length} site(s))`,
		"",
		...report.failures.map(
			(site) => `• <${site.url}|${site.source}>: ${site.status !== undefined ? `HTTP ${site.status}` : site.error}`,
		),
	].join("\n");

	try {
		const res = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text }),
			signal: AbortSignal.timeout(SLACK_POST_TIMEOUT_MS),
		});
		if (!res.ok) {
			throw new Error(`Slack webhook returned HTTP ${res.status}`);
		}
		console.log("[health] Slack failure alert delivered");
	} catch (cause) {
		console.error(`[health] Slack alert failed (suppressed): ${causeMessage(cause)}`);
	}
}