import { Spinner } from "./ui/Spinner";

export function LoadingState({ label = "Loading…", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={`async-state${compact ? " compact" : ""}`}>
      <Spinner size={compact ? "sm" : "md"} label={label} />
      <span>{label}</span>
    </div>
  );
}

export function PageLoader({ label = "Loading application..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "12px", color: "#12274e" }}>
      <Spinner size="lg" label={label} />
      <span style={{ fontSize: "14px", fontWeight: 600 }}>{label}</span>
    </div>
  );
}

export function SectionLoader({ label = "Loading content..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px", gap: "10px", color: "#64748b" }}>
      <Spinner size="md" label={label} />
      <span style={{ fontSize: "13px" }}>{label}</span>
    </div>
  );
}

export function InlineLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#64748b" }}>
      <Spinner size="xs" label={label} />
      {label && <span>{label}</span>}
    </span>
  );
}

export function ButtonLoadingContent({ label }: { label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
      <Spinner size="xs" label={label} />
      <span>{label}</span>
    </span>
  );
}

export function ErrorState({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={`async-state error${compact ? " compact" : ""}`}>
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

