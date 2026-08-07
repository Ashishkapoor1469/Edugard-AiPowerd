import type { CSSProperties } from "react";

export function Skeleton({ width = "100%", height = 12, shape = "rounded" }: { width?: CSSProperties["width"]; height?: CSSProperties["height"]; shape?: "rounded" | "circle" | "rectangle" }) {
  return <span aria-hidden="true" style={{ display: "block", width, height, borderRadius: shape === "circle" ? "999px" : shape === "rectangle" ? 0 : 8, background: "#e2e8f0", animation: "skeleton-pulse 1.5s ease-in-out infinite" }} />;
}
