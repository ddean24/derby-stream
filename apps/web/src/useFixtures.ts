import { useCallback, useEffect, useRef, useState } from "react";
import { fetchData } from "./data";
import { isLive } from "./lib/format";
import type { Fixture, StreamsByFixture } from "@derby-streams/shared";

type LoadState =
	| { status: "loading" }
	| { status: "loaded"; fixtures: Fixture[]; streams: StreamsByFixture[] }
	| { status: "error"; message: string };

export interface UseFixturesOptions {
	refreshIntervalMs?: number;
	autoRefresh?: boolean;
}

export interface UseFixturesResult {
	status: LoadState["status"];
	fixtures: Fixture[];
	streams: StreamsByFixture[];
	errorMessage: string | null;
	refresh: () => void;
}

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

export function useFixtures(options: UseFixturesOptions = {}): UseFixturesResult {
	const { autoRefresh = false, refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS } = options;

	const [state, setState] = useState<LoadState>({ status: "loading" });
	const [reloadKey, setReloadKey] = useState(0);
	const reloadKeyRef = useRef(0);

	const requestRefresh = useCallback(() => {
		reloadKeyRef.current += 1;
		setReloadKey(reloadKeyRef.current);
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		setState((prev) => (prev.status === "loaded" ? prev : { status: "loading" }));
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

	const hasLiveFixtures = state.status === "loaded" && state.fixtures.some(isLive);
	const shouldAutoRefresh = autoRefresh || hasLiveFixtures;

	useEffect(() => {
		if (!shouldAutoRefresh) return;
		const interval = window.setInterval(() => requestRefresh(), refreshIntervalMs);
		return () => window.clearInterval(interval);
	}, [shouldAutoRefresh, refreshIntervalMs, requestRefresh]);

	return {
		status: state.status,
		fixtures: state.status === "loaded" ? state.fixtures : [],
		streams: state.status === "loaded" ? state.streams : [],
		errorMessage: state.status === "error" ? state.message : null,
		refresh: requestRefresh,
	};
}
