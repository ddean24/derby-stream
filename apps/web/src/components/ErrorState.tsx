interface ErrorStateProps {
	title: string;
	message?: string | null;
	onRetry?: () => void;
}

export default function ErrorState({ title, message, onRetry }: ErrorStateProps) {
	return (
		<div className="w-full max-w-md rounded-lg border border-red-900/50 bg-red-950/30 px-6 py-8 text-center">
			<h2 className="text-lg font-semibold text-red-300">{title}</h2>
			{message != null && message !== "" && <p className="mt-2 text-sm text-red-300/70">{message}</p>}
			{onRetry !== undefined && (
				<button
					type="button"
					onClick={onRetry}
					className="mt-5 rounded bg-red-900/60 px-4 py-2 text-sm font-semibold text-red-100 transition-colors hover:bg-red-800/80"
				>
					Retry
				</button>
			)}
		</div>
	);
}
