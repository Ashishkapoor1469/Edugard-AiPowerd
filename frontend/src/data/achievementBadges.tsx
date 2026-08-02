import type React from "react";
import BadgeIllustration from "../components/achievements/BadgeIllustrations.js";

export type AchievementCategory = "leadership" | "academic" | "sports" | "cultural" | "service" | "technical" | "participation";
export type AchievementLevel = "college" | "university" | "state" | "national";

export type AchievementBadge = {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  category: AchievementCategory;
  icon: React.ReactNode;
  shape: "circle" | "scalloped" | "shield" | "square" | "arch";
  colors: { primary: string; secondary: string; accent: string };
  awardedAt?: string;
  awardedBy?: string;
  eventName?: string;
  certificateUrl?: string;
  level?: AchievementLevel;
  isEarned: boolean;
};

const badge = (id: string, name: string, shortLabel: string, description: string, category: AchievementCategory, shape: AchievementBadge["shape"], colors: AchievementBadge["colors"]): AchievementBadge => ({
  id, name, shortLabel, description, category, shape, colors, isEarned: false,
  icon: <BadgeIllustration kind={id} title={`${name} illustration`} />,
});

export const achievementBadgeCatalog: AchievementBadge[] = [
  badge("class-representative", "Class Representative", "CR", "Recognises trusted student leadership and service as a class representative.", "leadership", "scalloped", { primary: "#3155C6", secondary: "#F6C945", accent: "#78B84A" }),
  badge("participation", "Active Participant", "ACTIVE PARTICIPANT", "Awarded for enthusiastic participation in college activities.", "participation", "circle", { primary: "#F28B45", secondary: "#EA6675", accent: "#FFF4D8" }),
  badge("competition-winner", "Competition Winner", "1ST PLACE", "Celebrates a first-place finish in a recognised competition.", "participation", "shield", { primary: "#F6C945", secondary: "#EA6675", accent: "#132238" }),
  badge("runner-up", "Runner-Up", "RUNNER-UP", "Recognises an excellent second-place competition result.", "participation", "circle", { primary: "#3155C6", secondary: "#D9DEE7", accent: "#FFFFFF" }),
  badge("nss-volunteer", "NSS Volunteer", "NSS VOLUNTEER", "Recognises meaningful volunteer service through NSS activities.", "service", "square", { primary: "#EA6675", secondary: "#132238", accent: "#FFFFFF" }),
  badge("community-service", "Community Service", "COMMUNITY HERO", "Celebrates positive action that supports the local community.", "service", "arch", { primary: "#78B84A", secondary: "#F6C945", accent: "#EA6675" }),
  badge("sports-achievement", "Sports Achievement", "SPORTS STAR", "Awarded for notable performance and sportsmanship in athletics.", "sports", "shield", { primary: "#28A99E", secondary: "#F6C945", accent: "#132238" }),
  badge("cultural-performer", "Cultural Performer", "CULTURAL STAR", "Celebrates an outstanding contribution to college arts and culture.", "cultural", "scalloped", { primary: "#7954B8", secondary: "#EA6675", accent: "#FFF4D8" }),
  badge("debate-champion", "Debate Champion", "DEBATE CHAMP", "Recognises persuasive speaking, listening and debating skill.", "cultural", "arch", { primary: "#3155C6", secondary: "#F28B45", accent: "#FFFFFF" }),
  badge("coding-champion", "Coding Champion", "CODE CHAMP", "Awarded for excellent problem-solving and programming achievement.", "technical", "square", { primary: "#132238", secondary: "#A9DC54", accent: "#F6C945" }),
  badge("academic-excellence", "Academic Excellence", "ACADEMIC STAR", "Celebrates sustained excellence in academic performance.", "academic", "shield", { primary: "#3155C6", secondary: "#F6C945", accent: "#FFFFFF" }),
  badge("event-coordinator", "Event Coordinator", "EVENT LEAD", "Recognises dependable planning and delivery of a college event.", "leadership", "square", { primary: "#28A99E", secondary: "#7954B8", accent: "#FFF4D8" }),
  badge("attendance-excellence", "Attendance Excellence", "100% ATTENDANCE", "Awarded for maintaining perfect attendance for the recognised period.", "academic", "circle", { primary: "#78B84A", secondary: "#F6C945", accent: "#132238" }),
  badge("team-leader", "Team Leader", "TEAM LEADER", "Celebrates supportive leadership that helps a student team succeed.", "leadership", "arch", { primary: "#EA6675", secondary: "#3155C6", accent: "#FFF4D8" }),
  badge("innovation-award", "Innovation Award", "INNOVATOR", "Recognises an original idea, invention or creative solution.", "technical", "scalloped", { primary: "#F6C945", secondary: "#F28B45", accent: "#132238" }),
];

export type EarnedBadgeRecord = { badgeId?: string; sourceKey?: string; type?: string; name?: string; description?: string; category?: AchievementCategory; awardedAt?: string; awardedBy?: string; eventName?: string; certificateUrl?: string; level?: AchievementLevel };

const badgeCacheKey = (studentId: string) => `eduguard_achievement_badges_${studentId}`;
export const readAchievementBadgeCache = (studentId: string): EarnedBadgeRecord[] | null => {
  try {
    const cached = JSON.parse(sessionStorage.getItem(badgeCacheKey(studentId)) || "null");
    return cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000 ? cached.data : null;
  } catch { return null; }
};
export const writeAchievementBadgeCache = (studentId: string, data: EarnedBadgeRecord[]) => {
  try { sessionStorage.setItem(badgeCacheKey(studentId), JSON.stringify({ data, timestamp: Date.now() })); } catch { /* Badge display still works without cache storage. */ }
};

export const mergeAchievementBadges = (earned: EarnedBadgeRecord[], isCr = false) => {
  const catalog = achievementBadgeCatalog.map((definition) => {
    const award = earned.find((item) => item.badgeId === definition.id || item.type === definition.id);
    return { ...definition, ...(award ?? {}), name: award?.name || definition.name, description: award?.description || definition.description, isEarned: !!award || (isCr && definition.id === "class-representative") };
  });
  const fallback = achievementBadgeCatalog.find((item) => item.id === "participation")!;
  const custom = earned.filter((item) => !achievementBadgeCatalog.some((definition) => item.badgeId === definition.id || item.type === definition.id)).map((item, index) => ({
    ...fallback, ...item, id: `co-curricular-${item.sourceKey || index}`, name: item.name || "Co-curricular Achievement", shortLabel: "CO-CURRICULAR", description: item.description || "Awarded for a recognised co-curricular contribution.", category: item.category || fallback.category, isEarned: true,
  }));
  return [...catalog, ...custom];
};

export const sampleAchievementBadges = mergeAchievementBadges([
  { badgeId: "participation", awardedAt: "2026-01-12", eventName: "Orientation Week", level: "college" },
  { badgeId: "competition-winner", awardedAt: "2026-02-03", eventName: "Inter-college Quiz", level: "university" },
  { badgeId: "community-service", awardedAt: "2026-03-18", eventName: "Campus Clean-up", level: "college" },
  { badgeId: "sports-achievement", awardedAt: "2026-04-09", eventName: "Athletics Meet", level: "state" },
  { badgeId: "coding-champion", awardedAt: "2026-05-22", eventName: "Code Sprint", level: "college" },
  { badgeId: "academic-excellence", awardedAt: "2026-06-15", eventName: "Semester Awards", level: "university" },
], true);
