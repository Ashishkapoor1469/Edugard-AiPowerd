import React from "react";

export type SpinnerProps = {
  size?: "xs" | "sm" | "md" | "lg";
  label?: string;
  className?: string;
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  label = "Loading...",
  className = "",
}) => {
  const sizeMap = {
    xs: "h-3 w-3 border-2",
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-3",
    lg: "h-9 w-9 border-4",
  };

  const spinnerSizeClass = sizeMap[size] || sizeMap.md;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <span
        className={`animate-spin rounded-full border-slate-300 border-t-current ${spinnerSizeClass}`}
        aria-hidden="true"
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
};
