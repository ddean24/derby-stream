import { useCallback, useEffect, useState } from "react";
import { fetchData } from "./data";
import type { Fixture, StreamsByFixture } from "@derby-streams/shared";

type LoadState =
	| { status: "loading" }
	| { status: "loaded"; fixtures: Fixture[]; streams: StreamsByFixture[] }
	| { status: "error"; message: string };

export interface UseFixturesResult {
	status: LoadState["status"];
	fixtures: Fixture[];
	streams: StreamsByFixture[];
	errorMessage: string | null;
	refresh: () => void;
}

export function useFixtures(): UseFixturesResult {
	const [state, setState] = useState<LoadState>({ status: "loading" });
	const [reloadKey, setReloadKey] = useState(0);

	useEffect(() => {
		const controller = new AbortController();
		setState({ status: "loading" });
		fetchData({ signal: controller.signal })
			.then((data) => {
				if (controller.signal.aborted) return;
				setState({ status: "loaded", fixtures: data.fixtures, streams: data.streams });
			})
			.catch((err: unknown) => {
				if (controller.signal.aborted) return;
				setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
			});
		return () => controller.abort();
	}, [reloadKey]);

	const refresh = useCallback(() => {
		setReloadKey((key) => key + 1);
	}, []);

	return {
		status: state.status,
		fixtures: state.status === "loaded" ? state.fixtures : [],
		streams: state.status === "loaded" ? state.streams : [],
		errorMessage: state.status === "error" ? state.message : null,
		refresh,
	};
}
