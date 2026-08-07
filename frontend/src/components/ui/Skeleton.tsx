import type { CSSProperties } from "react";

type SkeletonProps = {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  shape?: "rectangle" | "rounded" | "circle";
  className?: string;
};

export function Skeleton({ width, height, shape = "rounded", className = "" }: SkeletonProps) {
  const shapeClass = shape === "circle" ? "rounded-full" : shape === "rectangle" ? "rounded-none" : "rounded-lg";
  return <span aria-hidden="true" className={`block animate-pulse bg-slate-200 ${shapeClass} ${className}`} style={{ width, height }} />;
}
