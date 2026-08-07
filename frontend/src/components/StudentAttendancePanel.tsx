import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import CRBadge from "./CRBadge.js";
import { ErrorState, CardGridSkeleton } from "./AsyncState.js";

type Status = "present" | "absent" | "leave";
interface RosterStudent { _id: string; name: string; rollNo: string; classId: string; }
interface AttendanceRecord { _id: string; date: string; session: string; status: Status; }
interface Context { isCr: boolean; canMark: boolean; canUpdate: boolean; currentSession: string | null; submittedSession?: string; submittedAt?: string; submittedRecords: { studentId: string; status: Status }[]; collegeTime: string; timeZone: string; roster: RosterStudent[]; }
interface AttendanceCache { expiresAt: number; history: AttendanceRecord[]; percentage: number | null; refreshes: number; }

const CACHE_KEY = "attendance_history_cache";
const ONE_DAY = 24 * 60 * 60 * 1000;
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const readCache = (): AttendanceCache | null => {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as AttendanceCache | null;
    return cache && cache.expiresAt > Date.now() ? cache : null;
  } catch { return null; }
};

export default function StudentAttendancePanel() {
  const [context, setContext] = useState<Context | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [percentage, setPercentage] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Status | "">>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const applyContext = (data: Context) => {
    setContext(data);
    const submitted = new Map((data.submittedRecords || []).map((record) => [record.studentId, record.status]));
    setStatuses(Object.fromEntries((data.roster || []).map((student) => [student._id, submitted.get(student._id) || ""])));
  };

  const load = async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const cached = force ? null : readCache();
      const [contextResponse, historyResponse] = await Promise.all([axios.get("/api/attendance/context"), cached ? Promise.resolve(null) : axios.get("/api/attendance/history")]);
      applyContext(contextResponse.data.data);
      const nextHistory = cached?.history || historyResponse?.data.data || [];
      const nextPercentage = cached ? cached.percentage : historyResponse?.data.attendancePercentage ?? null;
      setHistory(nextHistory);
      setPercentage(nextPercentage);
      if (!cached) localStorage.setItem(CACHE_KEY, JSON.stringify({ expiresAt: Date.now() + ONE_DAY, history: nextHistory, percentage: nextPercentage, refreshes: readCache()?.refreshes || 0 }));
    } catch { setError("Failed to load attendance."); toast.error("Failed to load attendance"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const refresh = async () => {
    const cached = readCache();
    if ((cached?.refreshes || 0) >= 3) { toast.error("Daily refresh limit reached (3)"); return; }
    setRefreshing(true);
    try {
      const [contextResponse, historyResponse] = await Promise.all([axios.get(context?.isCr ? "/api/attendance/cr/refresh" : "/api/attendance/context"), axios.get("/api/attendance/history")]);
      applyContext(contextResponse.data.data);
      const nextHistory = historyResponse.data.data || [];
      const nextPercentage = historyResponse.data.attendancePercentage ?? null;
      setHistory(nextHistory);
      setPercentage(nextPercentage);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ expiresAt: Date.now() + ONE_DAY, history: nextHistory, percentage: nextPercentage, refreshes: (cached?.refreshes || 0) + 1 }));
    } catch (error: unknown) { toast.error(axios.isAxiosError(error) && error.response?.status === 429 ? "Refresh limit reached" : "Failed to refresh attendance"); }
    finally { setRefreshing(false); }
  };

  const calendar = useMemo(() => {
    const byDate = new Map<string, AttendanceRecord[]>();
    history.forEach((record) => byDate.set(record.date, [...(byDate.get(record.date) || []), record]));
    const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: firstWeekday + days }, (_, index) => {
      if (index < firstWeekday) return null;
      const date = new Date(month.getFullYear(), month.getMonth(), index - firstWeekday + 1);
      const records = byDate.get(dayKey(date)) || [];
      const morningPresent = records.some((record) => record.session === "morning" && record.status === "present");
      const afternoonPresent = records.some((record) => record.session === "afternoon" && record.status === "present");
      const state = records.length === 0 ? "unmarked" : records.some((record) => record.status === "leave") ? "leave" : morningPresent && afternoonPresent ? "present" : morningPresent || afternoonPresent ? "half" : "absent";
      return { date, records, state };
    });
  }, [history, month]);

  const complete = !!context?.roster.length && context.roster.every((student) => statuses[student._id]);
  const save = async (change: boolean) => {
    if (!context || !complete || (!change && (!context.canMark || !context.currentSession)) || (change && (!context.canUpdate || !context.submittedSession))) return;
    setSubmitting(true);
    try {
      await axios[change ? "patch" : "post"](change ? "/api/attendance/change" : "/api/attendance/mark", {
        session: change ? context.submittedSession : context.currentSession,
        records: context.roster.map((student) => ({ studentId: student._id, status: statuses[student._id] })),
      });
      toast.success(change ? "Attendance updated" : "Attendance finalized");
      await load(true);
    } catch (error: unknown) { toast.error(axios.isAxiosError(error) ? error.response?.data?.message || "Attendance submission failed" : "Attendance submission failed"); }
    finally { setSubmitting(false); }
  };

  if (loading && !context) return <CardGridSkeleton count={2} label="Loading attendance" />;
  if (error && !context) return <ErrorState message={error} onRetry={() => load(true)} />;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-bold text-slate-800">Attendance history</h2><p className="mt-1 text-xs text-slate-500">{percentage == null ? "No finalized sessions" : `${percentage}% present across finalized sessions`}</p></div>
          <div className="flex items-center gap-2">{context?.isCr && <CRBadge />}<button type="button" disabled={refreshing} onClick={refresh} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-primary disabled:opacity-50">{refreshing ? "Refreshing…" : `Refresh (${3 - (readCache()?.refreshes || 0)} left)`}</button></div>
        </div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-600">‹</button>
          <strong className="text-sm text-slate-800">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
          <button type="button" aria-label="Next month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-600">›</button>
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-bold uppercase text-slate-400" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="mt-2 grid grid-cols-7 gap-2" role="grid" aria-label={`Attendance calendar for ${month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`}>
          {calendar.map((day, index) => {
            if (!day) return <span key={`empty-${index}`} />;
            const { date, records, state } = day;
            const label = `${date.toLocaleDateString()}: ${state}${records.length ? ` (${records.map((record) => `${record.session} ${record.status}`).join(", ")})` : ""}`;
            const color = state === "present" ? "bg-emerald-600 text-white" : state === "half" ? "bg-emerald-200 text-emerald-900" : state === "leave" ? "bg-orange-500 text-white" : state === "absent" ? "bg-red-500 text-white" : "text-slate-500";
            const today = dayKey(date) === dayKey(new Date());
            return <span key={dayKey(date)} tabIndex={0} title={label} aria-label={label} className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold outline-none focus:ring-2 focus:ring-primary ${today ? "ring-2 ring-primary ring-offset-2" : ""} ${color}`}>{date.getDate()}</span>;
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-slate-600"><span><b className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />Present</span><span><b className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-200" />Half day</span><span><b className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />Leave</span><span><b className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-red-500" />Absent</span></div>
      </section>

      {context?.isCr && (
        <form onSubmit={(event) => event.preventDefault()} className="rounded-2xl border border-primary/15 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800">Class attendance</h2>
          {context.canMark ? <p className="mb-4 mt-1 text-xs text-slate-500">{context.currentSession} session · {new Date(context.collegeTime).toLocaleString()} ({context.timeZone})</p> : !context.canUpdate && <div role="alert" className="mb-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><strong className="block font-bold">Attendance marking is currently closed</strong>Present and Absent can only be selected during the college session window.</div>}
          {context.canUpdate && <p className="mb-4 mt-1 text-xs text-amber-700">The {context.submittedSession} submission can be corrected until 15 minutes after submission.</p>}
          <div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Roll no.</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">
            {context.roster.map((student) => <tr key={student._id}><td className="px-4 py-3 font-semibold text-slate-800">{student.name}</td><td className="px-4 py-3 text-slate-500">{student.rollNo}</td><td className="px-4 py-3"><select aria-label={`Attendance status for ${student.name}`} disabled={!(context.canMark || context.canUpdate) || submitting} required value={statuses[student._id] || ""} onChange={(event) => setStatuses((current) => ({ ...current, [student._id]: event.target.value as Status }))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5"><option value="">Select</option><option value="present">Present</option><option value="absent">Absent</option><option value="leave">Leave</option></select></td></tr>)}
          </tbody></table></div>
          <div className="mt-4 flex flex-wrap gap-2">{context.canMark && <button type="button" onClick={() => save(false)} disabled={!complete || submitting} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">Finalize full roster</button>}{context.canUpdate && <button type="button" onClick={() => save(true)} disabled={!complete || submitting} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">{submitting ? "Updating…" : "Update / Change"}</button>}</div>
        </form>
      )}
    </div>
  );
}
