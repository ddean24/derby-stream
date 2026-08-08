// The repo hosting the fixture data + scraper. Used for the "Scrape now"
// affordance, which is a deep-link to the workflow_dispatch page rather than a
// live trigger — a real API token embedded in a static GitHub Pages client
// would be public, so we take users to the Actions page where the secret stays
// server-side (see PLAN.md item 7.4). Overridable via VITE_GITHUB_REPO at build.
function scrapeUrl(): string {
	const repo = import.meta.env.VITE_GITHUB_REPO ?? "ddean24/derby-stream";
	return `https://github.com/${repo}/actions/workflows/scrape.yml`;
}

export default function Header() {
	return (
		<header className="border-b border-slate-800 px-6 py-4">
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-2xl font-bold">Derby Streams</h1>
				<nav className="flex items-center gap-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
					<a href="#" className="transition-colors hover:text-slate-200">
						Fixtures
					</a>
					<a href="#/calendar" className="transition-colors hover:text-slate-200">
						Calendar
					</a>
					<a
						href={scrapeUrl()}
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-slate-200"
					>
						Scrape now
					</a>
				</nav>
			</div>
		</header>
	);
}
