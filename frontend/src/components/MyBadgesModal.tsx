import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.js";

interface Badge { sourceKey: string; type: string; color: string; name: string; description: string; awardedAt: string; }

const colors: Record<string, string> = {
  amber: "from-amber-300 to-orange-500 text-amber-950",
  emerald: "from-emerald-300 to-emerald-600 text-emerald-950",
  sky: "from-sky-300 to-blue-600 text-sky-950",
  violet: "from-violet-300 to-purple-600 text-violet-950",
  teal: "from-teal-300 to-cyan-600 text-teal-950",
};

export default function MyBadgesModal() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const open = user?.role === "student" && params.get("badges") === "1";
  const [badges, setBadges] = useState<Badge[] | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof window.setTimeout> | undefined;
    let cancelled = false;
    const load = () => axios.get("/api/students/me/badges")
      .then((response) => {
        if (cancelled) return;
        setBadges(response.data.data || []);
        setProcessing(!!response.data.processing);
        if (response.data.processing) timer = window.setTimeout(load, 15_000);
      })
      .catch(() => { if (!cancelled) toast.error("Failed to load badges"); });
    load();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [open]);

  if (!open) return null;
  const close = () => { const next = new URLSearchParams(params); next.delete("badges"); setParams(next, { replace: true }); };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="my-badges-title" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="max-h-[85dvh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/20 bg-white p-5 shadow-2xl md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="my-badges-title" className="text-xl font-bold text-slate-900">My Badges</h2><p className="mt-1 text-xs text-slate-500">Badges earned from your co-curricular achievements.</p></div><button onClick={close} className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-500 hover:bg-slate-100" aria-label="Close badges">✕</button></div>
        {processing && <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800"><span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />Checking new co-curricular entries and preparing badges. This page updates automatically.</div>}
        {badges === null ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-2xl bg-slate-100" />)}</div> : badges.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 py-14 text-center text-sm text-slate-500">No co-curricular badges have been awarded yet.</div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{badges.map((badge) => <article key={badge.sourceKey} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className={`flex h-32 items-center justify-center bg-gradient-to-br ${colors[badge.color] || colors.teal}`}><div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/80 bg-white/25 text-center text-xs font-black uppercase tracking-wider shadow-lg">{badge.type}</div></div><div className="p-4"><h3 className="text-sm font-bold text-slate-900">{badge.name}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">{badge.description}</p><p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Awarded {new Date(badge.awardedAt).toLocaleDateString()}</p></div></article>)}</div>}
      </div>
    </div>
  );
}
