import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { ErrorState, LoadingState } from "../AsyncState.js";
import { mergeAchievementBadges, type AchievementBadge as BadgeData, type EarnedBadgeRecord } from "../../data/achievementBadges.js";
import AchievementBadgeGrid from "./AchievementBadgeGrid.js";
import BadgeDetailsDialog from "./BadgeDetailsDialog.js";
import AwardBadgeForm from "./AwardBadgeForm.js";

type StudentOption = { _id: string; name: string; rollNo: string; class: string };

export default function StudentAchievementsSection({ student, isCr = false, canAward = false, awardedBy }: { student: StudentOption; isCr?: boolean; canAward?: boolean; awardedBy?: string }) {
  const [earned, setEarned] = useState<EarnedBadgeRecord[]>([]);
  const [selected, setSelected] = useState<BadgeData | null>(null);
  const [showAward, setShowAward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setLoading(true); setError("");
    axios.get(`/api/students/${student._id}/badges`).then(({ data }) => setEarned(data.data || [])).catch((err) => setError(err.response?.data?.message || "Could not load achievement badges")).finally(() => setLoading(false));
  }, [student._id]);
  useEffect(() => {
    let active = true;
    axios.get(`/api/students/${student._id}/badges`)
      .then(({ data }) => { if (active) setEarned(data.data || []); })
      .catch((err) => { if (active) setError(err.response?.data?.message || "Could not load achievement badges"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [student._id]);
  const badges = mergeAchievementBadges(earned, isCr);
  const earnedCount = badges.filter((badge) => badge.isEarned).length;

  return <section aria-labelledby="achievements-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 id="achievements-title" className="text-lg font-black text-[#132238]">Achievements &amp; Badges</h2><p className="mt-1 text-xs text-slate-500">{earnedCount} of {badges.length} collectible badges earned</p></div>{canAward && <button type="button" onClick={() => setShowAward(true)} className="rounded-xl bg-[#3155C6] px-4 py-2 text-sm font-black text-white shadow transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3155C6]/30">Award Badge</button>}</div>
    {loading ? <LoadingState label="Loading achievement badges…" /> : error ? <ErrorState message={error} onRetry={load} /> : <AchievementBadgeGrid badges={badges} onSelect={setSelected} />}
    <BadgeDetailsDialog badge={selected} onClose={() => setSelected(null)} />
    {showAward && <AwardBadgeForm initialStudent={student} awardedBy={awardedBy} onClose={() => setShowAward(false)} onAwarded={(studentId, badge) => { if (studentId === student._id) setEarned((current) => [...current, badge as EarnedBadgeRecord]); }} />}
  </section>;
}
