/**
 * notify CLI — alerts on newly-available streams.
 *
 * Runs AFTER the scraper in CI (see scrape.yml). Reads the committed
 * streams.json / fixtures.json / alerts.json, POSTs a Slack message for every
 * fixture whose streams have appeared but not yet been alerted, then persists
 * the alerted set. A fixture id enters alerts.json the first time it fires, so
 * later runs stay silent.
 *
 * Safe no-op by design:
 *   - streams.json not yet present          -> nothing pending, exit 0
 *   - SLACK_WEBHOOK_URL not set (offline)    -> log, exit 0 without alerting
 *   - a webhook POST fails                   -> log, exit non-zero (CI surface)
 */

import {
	findPendingAlerts,
	readAlertedIds,
	readFixtures,
	readStreams,
	slackMessage,
	SLACK_WEBHOOK_URL,
	writeAlertedIds,
} from "./alerts.ts";

const SLACK_POST_TIMEOUT_MS = 10_000;

async function postToSlack(webhookUrl: string, message: string): Promise<void> {
	const res = await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text: message }),
		signal: AbortSignal.timeout(SLACK_POST_TIMEOUT_MS),
	});
	if (!res.ok) {
		throw new Error(`Slack webhook returned HTTP ${res.status}`);
	}
}

async function run(): Promise<void> {
	const streams = readStreams();
	if (streams.length === 0) {
		console.log("[alerts] no stream data committed yet; nothing to alert on");
		return;
	}

	const fixtures = readFixtures();
	const alertedIds = new Set(readAlertedIds());
	const pending = findPendingAlerts(streams, fixtures, alertedIds);

	if (pending.length === 0) {
		console.log("[alerts] nothing new to alert on");
		return;
	}

	if (!SLACK_WEBHOOK_URL) {
		// Offline/dev run: surface what WOULD have gone out, but do NOT write
		// alerts.json — the webhook may be configured later and we don't want
		// to "consume" the alerts before they're really delivered.
		console.log(
			`[alerts] SLACK_WEBHOOK_URL not set; skipping ${pending.length} alert(s) without persisting`,
		);
		return;
	}

	for (const alert of pending) {
		await postToSlack(SLACK_WEBHOOK_URL, slackMessage(alert));
		console.log(`[alerts] alerted: ${alert.fixtureId}`);
	}

	const nextAlerted = [...new Set([...alertedIds, ...pending.map((alert) => alert.fixtureId)])];
	writeAlertedIds(nextAlerted);

	const summary = pending
		.map((alert) => `${alert.fixtureId} (${alert.links.length} link(s))`)
		.join(", ");
	console.log(`[alerts] committed ${pending.length} alert(s) to data/alerts.json: ${summary}`);
}

await run();