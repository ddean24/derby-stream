import { useEffect, useState } from "react";
import { formatCountdown } from "./lib/countdown";

// Live-ticking HH:MM:SS countdown to a future timestamp (ROADMAP 8.4). Ticks
// on a 1s interval and re-derives from targetMs fresh each tick (rather than
// decrementing), so a clock change / suspend doesn't drift the countdown.
export function useCountdown(targetMs: number): string | null {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		let frame: number;
		const tick = () => {
			setNow(Date.now());
			frame = window.setTimeout(tick, 1000);
		};
		frame = window.setTimeout(tick, 1000);
		return () => clearTimeout(frame);
	}, []);

	if (Number.isNaN(targetMs)) return null;
	const remaining = targetMs - now;
	if (remaining <= 0) return "0:00";
	return formatCountdown(remaining);
}