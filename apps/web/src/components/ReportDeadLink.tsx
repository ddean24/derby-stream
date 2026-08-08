import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink } from "lucide-react";
import type { Fixture } from "@derby-streams/shared";
import { useReportDeadLink } from "../useReportDeadLink";

// Same static-site deep-link pattern as Header.tsx's "Scrape now": no server,
// no API token - we hand the user a link to the workflow_dispatch page, where
// the secret stays server-side. GitHub's Actions UI does NOT prefill dispatch
// inputs from a URL, so this pane exists to show the exact fixture id to paste.
function workflowUrl(): string {
	const repo = import.meta.env.VITE_GITHUB_REPO ?? "ddean24/derby-stream";
	return `https://github.com/${repo}/actions/workflows/report-dead-link.yml`;
}

interface ReportDeadLinkProps {
	fixtureId: string;
	fixture?: Fixture;
}

export default function ReportDeadLink({ fixtureId, fixture }: ReportDeadLinkProps) {
	const { reportedToday, recordReport } = useReportDeadLink();
	const alreadyReported = reportedToday(fixtureId);
	const [copied, setCopied] = useState(false);

	// One report per fixture/day: record the date the first time this page is
	// opened today so re-visits show a polite "already reported" state instead
	// of re-offering the workflow deep-link (ROADMAP 8.9 spam guard).
	useEffect(() => {
		if (!alreadyReported) {
			recordReport(fixtureId);
		}
	}, [alreadyReported, fixtureId, recordReport]);

	const copyId = async () => {
		try {
			await navigator.clipboard.writeText(fixtureId);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard unavailable (e.g. insecure context) - the id is shown
			// as plain text underneath, so the user can still copy it manually.
		}
	};

	return (
		<div className="mx-auto max-w-3xl px-6 py-6">
			<a
				href={`#/match/${fixtureId}`}
				className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-200"
			>
				<ArrowLeft className="h-4 w-4" />
				Back to fixture
			</a>

			{fixture !== undefined && (
				<p className="mt-4 text-sm text-slate-400">
					{fixture.homeTeam.shortName} vs {fixture.awayTeam.shortName} · {fixture.competition.code}
				</p>
			)}

			<h1 className="mt-2 text-xl font-semibold text-slate-100">Report a dead link</h1>

			{alreadyReported ? (
				<div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/50 px-6 py-5 text-center">
					<p className="text-sm text-slate-400">
						Already reported today — will report again tomorrow.
					</p>
				</div>
			) : (
				<>
					<p className="mt-3 text-sm text-slate-400">
						This fixture's stream links are watched automatically, but if one has gone dead,
						you can flag it. The site has no backend, so the report is opened on GitHub —
						you'll just paste the id below.
					</p>

					<div className="mt-6 space-y-4">
						<button
							type="button"
							onClick={copyId}
							className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-left transition-colors hover:bg-slate-800/60"
							title="Click to copy the fixture id"
						>
							<span className="min-w-0">
								<span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
									Fixture id
								</span>
								<span className="mt-0.5 block truncate font-mono text-sm text-slate-200">
									{fixtureId}
								</span>
							</span>
							{copied ? (
								<Check className="h-4 w-4 shrink-0 text-emerald-400" />
							) : (
								<Copy className="h-4 w-4 shrink-0 text-slate-400" />
							)}
						</button>

						<ol className="list-decimal space-y-1 pl-5 text-sm text-slate-400">
							<li>Click "Open the run page" below.</li>
							<li>Paste the fixture id into the <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">fixture_id</code> field.</li>
							<li>Click "Run workflow" — a dead-link issue is opened on GitHub (then stop/delete the run).</li>
						</ol>

						<a
							href={workflowUrl()}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800"
						>
							Open the run page
							<ExternalLink className="h-4 w-4" />
						</a>
					</div>
				</>
			)}
		</div>
	);
}