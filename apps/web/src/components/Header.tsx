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
				</nav>
			</div>
		</header>
	);
}
