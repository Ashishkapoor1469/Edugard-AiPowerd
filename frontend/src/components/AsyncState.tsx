export function LoadingState({ label = "Loading…", compact = false }: { label?: string; compact?: boolean }) {
  return <div role="status" aria-live="polite" className={`flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 ${compact ? "py-4" : "min-h-40 rounded-2xl border border-slate-200 bg-white p-8"}`}><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-primary" aria-hidden="true" />{label}</div>;
}

export function ErrorState({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return <div role="alert" className={`text-center text-xs text-red-700 ${compact ? "py-4" : "min-h-40 rounded-2xl border border-red-100 bg-red-50 p-8"}`}><p>{message}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 font-bold text-red-700">Try again</button>}</div>;
}
