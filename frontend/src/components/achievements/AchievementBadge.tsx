import { useId } from "react";
import type { CSSProperties } from "react";
import type { AchievementBadge as BadgeData } from "../../data/achievementBadges.js";

type Props = { badge: BadgeData; onSelect?: (badge: BadgeData) => void; large?: boolean; compact?: boolean };
type BadgeStyle = CSSProperties & Record<"--badge-primary" | "--badge-secondary" | "--badge-accent", string>;

const shapePath: Record<BadgeData["shape"], string> = {
  circle: "M100 14a86 86 0 1 1 0 172 86 86 0 0 1 0-172Z",
  scalloped: "M100 10l13 9 15-5 9 13 16 1 4 16 15 7-2 16 12 11-8 15 6 15-13 9-1 16-16 4-7 15-16-2-11 12-15-8-15 6-9-13-16-1-4-16-15-7 2-16-12-11 8-15-6-15 13-9 1-16 16-4 7-15 16 2 11-12 15 8 15-6Z",
  shield: "M100 10 174 36v55c0 47-27 78-74 99-47-21-74-52-74-99V36Z",
  square: "M31 18h138a13 13 0 0 1 13 13v138a13 13 0 0 1-13 13H31a13 13 0 0 1-13-13V31a13 13 0 0 1 13-13Z",
  arch: "M28 180V85a72 72 0 0 1 144 0v95Z",
};

export default function AchievementBadge({ badge, onSelect, large = false, compact = false }: Props) {
  const pathId = useId().replace(/:/g, "");
  const style: BadgeStyle = { "--badge-primary": badge.colors.primary, "--badge-secondary": badge.colors.secondary, "--badge-accent": badge.colors.accent };
  return (
    <button type="button" onClick={() => onSelect?.(badge)} title={badge.isEarned ? badge.name : "Not earned yet"} aria-label={`${badge.name}. ${badge.isEarned ? "Earned" : "Not earned yet"}`} style={style}
      className={`achievement-sticker group relative mx-auto flex w-full flex-col items-center text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3155C6]/35 ${compact ? "max-w-6 rounded-md" : "max-w-[190px] rounded-2xl p-2"} ${badge.isEarned ? "hover:-translate-y-1 hover:scale-105 hover:shadow-xl" : "opacity-45 grayscale"} ${large ? "max-w-[260px]" : ""} ${badge.id === "class-representative" && !compact ? "bg-[#F6C945]/10 ring-2 ring-[#F6C945]/50" : ""}`}>
      {badge.id === "class-representative" && !compact && <span className="mb-1 rounded-full bg-[#132238] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-white">Featured leadership badge</span>}
      <span className="relative block aspect-square w-full">
        <svg viewBox="0 0 200 200" className="h-full w-full overflow-visible" role="img" aria-labelledby={`${pathId}-title`}>
          <title id={`${pathId}-title`}>{badge.name} collectible achievement badge</title>
          <path d={shapePath[badge.shape]} fill="var(--badge-primary)" stroke="#FFFFFF" strokeWidth="18" strokeLinejoin="round" />
          <path d={shapePath[badge.shape]} fill="var(--badge-primary)" stroke="#172033" strokeWidth="6" strokeLinejoin="round" />
          <circle cx="100" cy="100" r="68" fill="var(--badge-accent)" opacity=".18" stroke="var(--badge-secondary)" strokeWidth="4" strokeDasharray="8 8" />
          {badge.id === "class-representative" ? <>
            <defs><path id={`${pathId}-top`} d="M48 79a58 58 0 0 1 104 0"/><path id={`${pathId}-bottom`} d="M36 132a76 76 0 0 0 128 0"/></defs>
            <text fill="#FFFFFF" fontSize="13" fontWeight="900" letterSpacing="3"><textPath href={`#${pathId}-top`} startOffset="50%" textAnchor="middle">CLASS</textPath></text>
            <g transform="translate(55 63) scale(.56)">{badge.icon}</g>
            <text x="100" y="124" textAnchor="middle" fill="#F6C945" stroke="#172033" strokeWidth="5" paintOrder="stroke" fontSize="58" fontWeight="1000">CR</text>
            <text fill="#FFFFFF" fontSize="10" fontWeight="900" letterSpacing="1.6"><textPath href={`#${pathId}-bottom`} startOffset="50%" textAnchor="middle">REPRESENTATIVE</textPath></text>
          </> : <>
            <foreignObject x="45" y="35" width="110" height="102"><div className="flex h-full w-full items-center justify-center">{badge.icon}</div></foreignObject>
            <rect x="35" y="143" width="130" height="27" rx="13.5" fill="var(--badge-secondary)" stroke="#172033" strokeWidth="4" />
            <text x="100" y="161" textAnchor="middle" fill={badge.colors.secondary === "#132238" ? "#FFFFFF" : "#172033"} fontSize={badge.shortLabel.length > 14 ? "9" : "11"} fontWeight="900" letterSpacing=".7">{badge.shortLabel}</text>
          </>}
          <g className="badge-sparkles" fill="#F6C945" stroke="#172033" strokeWidth="2"><path d="m28 54 4 8 8 4-8 4-4 8-4-8-8-4 8-4z"/><path d="m173 104 3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/></g>
        </svg>
        {!badge.isEarned && !compact && <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#172033] text-white shadow" aria-hidden="true"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>}
      </span>
      {!compact && <><span className="mt-1 text-xs font-black text-[#172033]">{badge.name}</span>
      {badge.isEarned ? <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{badge.level || "college"}{badge.awardedAt ? ` · ${new Date(badge.awardedAt).toLocaleDateString()}` : ""}</span> : <span className="mt-1 text-[10px] font-bold text-slate-500">Not earned yet</span>}</>}
    </button>
  );
}
