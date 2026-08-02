import AchievementBadge from "./AchievementBadge.js";
import type { AchievementBadge as BadgeData } from "../../data/achievementBadges.js";

export default function AchievementBadgeGrid({ badges, onSelect }: { badges: BadgeData[]; onSelect: (badge: BadgeData) => void }) {
  return <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-5" aria-label="Student achievement badges">
    {badges.map((badge) => <AchievementBadge key={badge.id} badge={badge} onSelect={onSelect} />)}
  </div>;
}
