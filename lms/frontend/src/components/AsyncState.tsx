import { Spinner } from "./ui/Spinner";
import { Skeleton } from "./ui/Skeleton";

export function CardGridSkeleton({ count = 6, label = "Loading cards" }: { count?: number; label?: string }) {
  return <div role="status" aria-label={label} className="book-grid"><span className="sr-only">{label}</span>{Array.from({ length: count }, (_, index) => <div className="book-card" key={index} style={{ padding: 16, display: "block" }}><Skeleton height={120} /><div style={{ marginTop: 14, display: "grid", gap: 9 }}><Skeleton width="65%" /><Skeleton width="45%" height={9} /><Skeleton height={9} /></div></div>)}</div>;
}

export function ListSkeleton({ count = 6, label = "Loading list" }: { count?: number; label?: string }) {
  return <div role="status" aria-label={label}><span className="sr-only">{label}</span>{Array.from({ length: count }, (_, index) => <div className="list-row" key={index}><span style={{ width: "70%", display: "grid", gap: 7 }}><Skeleton width="55%" /><Skeleton width="80%" height={9} /></span><Skeleton width={72} height={24} /></div>)}</div>;
}

export function TableSkeleton({ rows = 7, columns = 5, label = "Loading table" }: { rows?: number; columns?: number; label?: string }) {
  return <div role="status" aria-label={label} style={{ display: "grid", gap: 1, background: "#eef2f7" }}><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, row) => <div key={row} style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12, padding: 12, background: "white" }}>{Array.from({ length: columns }, (_, column) => <Skeleton key={column} height={10} />)}</div>)}</div>;
}

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
