import { useEffect, useState } from "react";
import { fetchData } from "./data";

type LoadState =
	| { status: "loading" }
	| { status: "loaded"; data: Awaited<ReturnType<typeof fetchData>> }
	| { status: "error"; message: string };

export default function App() {
	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		const controller = new AbortController();
		fetchData({ signal: controller.signal })
			.then((data) => setState({ status: "loaded", data }))
			.catch((err: unknown) => {
				if (controller.signal.aborted) return;
				setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
			});
		return () => controller.abort();
	}, []);

	const statusLine =
		state.status === "loading"
			? "loading..."
			: state.status === "error"
				? `error: ${state.message}`
				: `${state.data.fixtures.length} fixtures loaded`;

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
			<div className="text-center">
				<h1 className="text-4xl font-bold">Derby Streams</h1>
				<p className="mt-4 text-slate-400">{statusLine}</p>
			</div>
		</main>
	);
}
