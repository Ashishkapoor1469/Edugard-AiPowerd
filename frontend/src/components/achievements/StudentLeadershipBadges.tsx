import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import AchievementBadge from "./AchievementBadge.js";
import { mergeAchievementBadges, readAchievementBadgeCache, writeAchievementBadgeCache, type EarnedBadgeRecord } from "../../data/achievementBadges.js";

export default function StudentLeadershipBadges({ studentId, isCr = false }: { studentId: string; isCr?: boolean }) {
  const navigate = useNavigate();
  const [earned, setEarned] = useState<EarnedBadgeRecord[]>(() => readAchievementBadgeCache(studentId) || []);
  useEffect(() => {
    if (readAchievementBadgeCache(studentId)) return;
    let active = true;
    axios.get(`/api/students/${studentId}/badges`).then(({ data }) => { if (active) { setEarned(data.data || []); writeAchievementBadgeCache(studentId, data.data || []); } }).catch(() => undefined);
    return () => { active = false; };
  }, [studentId]);
  const leadership = mergeAchievementBadges(earned, isCr).filter((badge) => badge.isEarned && badge.category === "leadership").slice(0, 3);
  if (!leadership.length) return null;
  return <span className="flex items-center gap-1" aria-label="Earned leadership badges">{leadership.map((badge) => <AchievementBadge key={badge.id} badge={badge} compact onSelect={() => navigate(`/badge?studentId=${studentId}`)} />)}</span>;
}
