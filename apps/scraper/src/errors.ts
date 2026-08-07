export const BACKOFF_CAP_MS = 30_000;
export const RATE_LIMIT_FLOOR_MS = 60_000;

export class FootballDataError extends Error {
	readonly status: number;

	constructor(status: number, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "FootballDataError";
		this.status = status;
	}
}

export class AuthError extends FootballDataError {
	constructor(status: number, message: string, options?: ErrorOptions) {
		super(status, message, options);
		this.name = "AuthError";
	}
}

export class RateLimitError extends FootballDataError {
	readonly retryAfterMs: number;

	constructor(status: number, retryAfterMs: number, message: string, options?: ErrorOptions) {
		super(status, message, options);
		this.name = "RateLimitError";
		this.retryAfterMs = retryAfterMs;
	}
}

export class NetworkError extends Error {
	constructor(message: string, options: { cause: unknown }) {
		super(message, options);
		this.name = "NetworkError";
	}
}

export function backoffDelayMs(attempt: number, baseMs: number = 1_000): number {
	return Math.min(baseMs * 2 ** attempt, BACKOFF_CAP_MS);
}
