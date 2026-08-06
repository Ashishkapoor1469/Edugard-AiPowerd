import { Spinner } from "./ui/Spinner";

export function LoadingState({ label = "Loading…", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 ${compact ? "py-4" : "min-h-40 rounded-2xl border border-slate-200 bg-white p-8"}`}>
      <Spinner size={compact ? "sm" : "md"} label={label} />
      <span>{label}</span>
    </div>
  );
}

export function PageLoader({ label = "Loading application..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-800">
      <Spinner size="lg" label={label} />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

export function SectionLoader({ label = "Loading content..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 p-8 text-xs text-slate-500">
      <Spinner size="md" label={label} />
      <span>{label}</span>
    </div>
  );
}

export function InlineLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <Spinner size="xs" label={label} />
      {label && <span>{label}</span>}
    </span>
  );
}

export function ButtonLoadingContent({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Spinner size="xs" label={label} />
      <span>{label}</span>
    </span>
  );
}

export function ErrorState({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={`text-center text-xs text-red-700 ${compact ? "py-4" : "min-h-40 rounded-2xl border border-red-100 bg-red-50 p-8"}`}>
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 font-bold text-red-700">
          Try again
        </button>
      )}
    </div>
  );
}

