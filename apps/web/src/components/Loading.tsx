interface LoadingProps {
	label?: string;
}

export default function Loading({ label }: LoadingProps) {
	return (
		<div className="flex flex-col items-center gap-4" role="status">
			<span
				className="h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-emerald-500"
				aria-hidden="true"
			/>
			{label !== undefined && <p className="text-sm text-slate-400">{label}</p>}
		</div>
	);
}
