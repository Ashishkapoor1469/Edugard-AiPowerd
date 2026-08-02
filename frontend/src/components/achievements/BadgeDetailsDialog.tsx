import { useEffect, useRef } from "react";
import axios from "axios";
import AchievementBadge from "./AchievementBadge.js";
import type { AchievementBadge as BadgeData } from "../../data/achievementBadges.js";

export default function BadgeDetailsDialog({ badge, onClose }: { badge: BadgeData | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!badge) return;
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [badge, onClose]);
  if (!badge) return null;
  const certificateHref = badge.certificateUrl?.startsWith("/") ? `${axios.defaults.baseURL?.replace(/\/$/, "")}${badge.certificateUrl}` : badge.certificateUrl;
  return <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-[#132238]/70 p-4" role="dialog" aria-modal="true" aria-labelledby="badge-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border-4 border-white bg-[#FFF4D8] p-5 shadow-2xl md:p-7">
      <div className="flex justify-end"><button ref={closeRef} type="button" onClick={onClose} className="rounded-full border-2 border-[#172033] bg-white px-3 py-1 text-sm font-black text-[#172033] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3155C6]/35" aria-label="Close badge details">×</button></div>
      <div className="mx-auto -mt-3 w-52"><AchievementBadge badge={badge} large /></div>
      <h2 id="badge-dialog-title" className="mt-3 text-center text-2xl font-black text-[#132238]">{badge.name}</h2>
      <p className="mt-2 text-center text-sm leading-6 text-slate-600">{badge.description}</p>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-white p-3"><dt className="font-bold uppercase text-slate-400">Category</dt><dd className="mt-1 font-bold capitalize text-[#132238]">{badge.category}</dd></div>
        <div className="rounded-xl bg-white p-3"><dt className="font-bold uppercase text-slate-400">Status</dt><dd className="mt-1 font-bold text-[#132238]">{badge.isEarned ? "Earned" : "Not earned yet"}</dd></div>
        {badge.awardedAt && <div className="rounded-xl bg-white p-3"><dt className="font-bold uppercase text-slate-400">Awarded</dt><dd className="mt-1 font-bold text-[#132238]">{new Date(badge.awardedAt).toLocaleDateString()}</dd></div>}
        {badge.level && <div className="rounded-xl bg-white p-3"><dt className="font-bold uppercase text-slate-400">Level</dt><dd className="mt-1 font-bold capitalize text-[#132238]">{badge.level}</dd></div>}
        {badge.awardedBy && <div className="col-span-2 rounded-xl bg-white p-3"><dt className="font-bold uppercase text-slate-400">Awarded by</dt><dd className="mt-1 font-bold text-[#132238]">{badge.awardedBy}</dd></div>}
        {badge.eventName && <div className="col-span-2 rounded-xl bg-white p-3"><dt className="font-bold uppercase text-slate-400">Event</dt><dd className="mt-1 font-bold text-[#132238]">{badge.eventName}</dd></div>}
      </dl>
      {certificateHref && <a href={certificateHref} target="_blank" rel="noreferrer" className="mt-5 block rounded-xl bg-[#3155C6] px-4 py-3 text-center text-sm font-black text-white shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3155C6]/35">View Certificate</a>}
    </article>
  </div>;
}
