export function LoadingState({ label = "Loading…", compact = false }: { label?: string; compact?: boolean }) {
  return <div role="status" aria-live="polite" className={`async-state${compact ? " compact" : ""}`}><span className="async-spinner" aria-hidden="true" />{label}</div>;
}

export function ErrorState({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return <div role="alert" className={`async-state error${compact ? " compact" : ""}`}><span>{message}</span>{onRetry && <button type="button" className="secondary" onClick={onRetry}>Try again</button>}</div>;
}
