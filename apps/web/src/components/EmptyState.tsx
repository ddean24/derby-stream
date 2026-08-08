interface EmptyStateProps {
	title: string;
	message?: string;
}

export default function EmptyState({ title, message }: EmptyStateProps) {
	return (
		<div className="mx-auto w-full max-w-md rounded-lg border border-dashed border-slate-800 bg-slate-900/30 px-6 py-10 text-center">
			<h2 className="text-base font-semibold text-slate-300">{title}</h2>
			{message !== undefined && <p className="mt-1.5 text-sm text-slate-500">{message}</p>}
		</div>
	);
}
