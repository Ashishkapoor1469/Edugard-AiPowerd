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
    xs: "12px",
    sm: "16px",
    md: "24px",
    lg: "36px",
  };

  const borderWidthMap = {
    xs: "2px",
    sm: "2px",
    md: "3px",
    lg: "4px",
  };

  const dim = sizeMap[size];
  const bw = borderWidthMap[size];

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 ${className}`}
      style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
    >
      <span
        style={{
          width: dim,
          height: dim,
          border: `${bw} solid currentColor`,
          borderRightColor: "transparent",
          borderRadius: "50%",
          display: "inline-block",
          animation: "spinner-rotate 0.75s linear infinite",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
};
