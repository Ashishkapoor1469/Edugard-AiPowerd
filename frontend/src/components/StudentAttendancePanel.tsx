import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import CRBadge from "./CRBadge.js";

type Status = "present" | "absent";
interface RosterStudent { _id: string; name: string; rollNo: string; classId: string; }
interface AttendanceRecord { _id: string; date: string; session: string; status: Status; }
interface Context { isCr: boolean; canMark: boolean; canUpdate: boolean; currentSession: string | null; submittedSession?: string; submittedAt?: string; submittedRecords: { studentId: string; status: Status }[]; collegeTime: string; timeZone: string; roster: RosterStudent[]; }

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export default function StudentAttendancePanel() {
  const [context, setContext] = useState<Context | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [percentage, setPercentage] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Status | "">>({});
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const applyContext = (data: Context) => {
    setContext(data);
    const submitted = new Map((data.submittedRecords || []).map((record) => [record.studentId, record.status]));
    setStatuses(Object.fromEntries((data.roster || []).map((student) => [student._id, submitted.get(student._id) || ""])));
  };

  const load = async () => {
    try {
      const [contextResponse, historyResponse] = await Promise.all([axios.get("/api/attendance/context"), axios.get("/api/attendance/history")]);
      applyContext(contextResponse.data.data);
      setHistory(historyResponse.data.data || []);
      setPercentage(historyResponse.data.attendancePercentage ?? null);
    } catch { toast.error("Failed to load attendance"); }
  };

  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [contextResponse, historyResponse] = await Promise.all([axios.get("/api/attendance/cr/refresh"), axios.get("/api/attendance/history")]);
      applyContext(contextResponse.data.data);
      setHistory(historyResponse.data.data || []);
      setPercentage(historyResponse.data.attendancePercentage ?? null);
    } catch (error: unknown) { toast.error(axios.isAxiosError(error) && error.response?.status === 429 ? "Refresh limit reached (3 per hour)" : "Failed to refresh attendance"); }
    finally { setRefreshing(false); }
  };

  const calendar = useMemo(() => {
    const byDate = new Map<string, AttendanceRecord[]>();
    history.forEach((record) => byDate.set(record.date, [...(byDate.get(record.date) || []), record]));
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 111 - start.getDay());
    return Array.from({ length: 112 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const records = byDate.get(dayKey(date)) || [];
      const morningPresent = records.some((record) => record.session === "morning" && record.status === "present");
      const afternoonPresent = records.some((record) => record.session === "afternoon" && record.status === "present");
      const state = records.length === 0 ? "unmarked" : morningPresent && afternoonPresent ? "full" : morningPresent ? "half" : "leave";
      return { date, records, state };
    });
  }, [history]);

  const complete = !!context?.roster.length && context.roster.every((student) => statuses[student._id]);
  const save = async (change: boolean) => {
    if (!context || !complete || (!change && (!context.canMark || !context.currentSession)) || (change && (!context.canUpdate || !context.submittedSession))) return;
    setSubmitting(true);
    setSyncing(true);
    const startedAt = Date.now();
    const syncTimeout = window.setTimeout(() => setSyncing(false), 5 * 60 * 1000);
    try {
      await axios[change ? "patch" : "post"](change ? "/api/attendance/change" : "/api/attendance/mark", {
        session: change ? context.submittedSession : context.currentSession,
        records: context.roster.map((student) => ({ studentId: student._id, status: statuses[student._id] })),
      });
      toast.success(change ? "Attendance updated" : "Attendance finalized");
      await load();
    } catch (error: unknown) { toast.error(axios.isAxiosError(error) ? error.response?.data?.message || "Attendance submission failed" : "Attendance submission failed"); }
    finally {
      window.setTimeout(() => { window.clearTimeout(syncTimeout); setSyncing(false); }, Math.max(0, 600 - (Date.now() - startedAt)));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-bold text-slate-800">Attendance history</h2><p className="mt-1 text-xs text-slate-500">{percentage == null ? "No finalized sessions" : `${percentage}% present across finalized sessions`}</p></div>
          {context?.isCr && <CRBadge />}
        </div>
        <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-2" role="grid" aria-label="Attendance calendar for the last 16 weeks">
          {calendar.map(({ date, records, state }) => {
            const label = `${date.toLocaleDateString()}: ${state}${records.length ? ` (${records.map((record) => `${record.session} ${record.status}`).join(", ")})` : ""}`;
            const color = state === "full" ? "bg-emerald-500 text-white" : state === "half" ? "bg-emerald-500/50 text-emerald-950" : state === "leave" ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500";
            return <span key={dayKey(date)} tabIndex={0} title={label} aria-label={label} className={`flex h-6 w-6 items-center justify-center rounded text-[9px] font-bold outline-none focus:ring-2 focus:ring-primary ${color}`}>{state === "full" ? "F" : state === "half" ? "H" : state === "leave" ? "L" : "·"}</span>;
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-slate-600"><span><b>F</b> Full day</span><span><b>H</b> Half day</span><span><b>L</b> Leave</span><span><b>·</b> Unmarked</span></div>
      </section>

      {context?.isCr && (
        <form onSubmit={(event) => event.preventDefault()} className="rounded-2xl border border-primary/15 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-slate-800">Class attendance</h2><button type="button" disabled={refreshing} onClick={refresh} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-primary disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh"}</button></div>
          {context.canMark ? <p className="mb-4 mt-1 text-xs text-slate-500">{context.currentSession} session · {new Date(context.collegeTime).toLocaleString()} ({context.timeZone})</p> : !context.canUpdate && <div role="alert" className="mb-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><strong className="block font-bold">Attendance marking is currently closed</strong>Present and Absent can only be selected during the college session window.</div>}
          {context.canUpdate && <p className="mb-4 mt-1 text-xs text-amber-700">The {context.submittedSession} submission can be corrected until 15 minutes after submission.</p>}
          <div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Roll no.</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">
            {context.roster.map((student) => <tr key={student._id}><td className="px-4 py-3 font-semibold text-slate-800">{student.name}</td><td className="px-4 py-3 text-slate-500">{student.rollNo}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><select aria-label={`Attendance status for ${student.name}`} disabled={!(context.canMark || context.canUpdate) || submitting} required value={statuses[student._id] || ""} onChange={(event) => setStatuses((current) => ({ ...current, [student._id]: event.target.value as Status }))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5"><option value="">Select</option><option value="present">Present</option><option value="absent">Absent</option></select>{syncing && <span className="text-[10px] font-semibold text-amber-600">Syncing…</span>}</div></td></tr>)}
          </tbody></table></div>
          <div className="mt-4 flex flex-wrap gap-2">{context.canMark && <button type="button" onClick={() => save(false)} disabled={!complete || submitting} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">Finalize full roster</button>}{context.canUpdate && <button type="button" onClick={() => save(true)} disabled={!complete || submitting} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">Update / Change</button>}</div>
        </form>
      )}
    </div>
  );
}
