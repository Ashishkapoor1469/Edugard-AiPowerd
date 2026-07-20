import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import CRBadge from "./CRBadge.js";

type Status = "present" | "absent";
interface RosterStudent { _id: string; name: string; rollNo: string; classId: string; }
interface AttendanceRecord { _id: string; date: string; session: string; status: Status; }
interface Context { isCr: boolean; canMark: boolean; currentSession: string | null; collegeTime: string; timeZone: string; roster: RosterStudent[]; }

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export default function StudentAttendancePanel() {
  const [context, setContext] = useState<Context | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [percentage, setPercentage] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Status | "">>({});
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const [contextResponse, historyResponse] = await Promise.all([
        axios.get("/api/attendance/context"),
        axios.get("/api/attendance/history"),
      ]);
      setContext(contextResponse.data.data);
      setHistory(historyResponse.data.data || []);
      setPercentage(historyResponse.data.attendancePercentage ?? null);
      setStatuses(Object.fromEntries((contextResponse.data.data.roster || []).map((s: RosterStudent) => [s._id, ""])));
    } catch {
      toast.error("Failed to load attendance");
    }
  };

  // Fetch once when this tab mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

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
      const state = records.length === 0 ? "unmarked" : records.every((r) => r.status === "present") ? "present" : records.every((r) => r.status === "absent") ? "absent" : "mixed";
      return { date, records, state };
    });
  }, [history]);

  const complete = !!context?.roster.length && context.roster.every((student) => statuses[student._id]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!context?.canMark || !context.currentSession || !complete) return;
    setSubmitting(true);
    try {
      await axios.post("/api/attendance/mark", {
        session: context.currentSession,
        records: context.roster.map((student) => ({ studentId: student._id, status: statuses[student._id] })),
      });
      toast.success("Attendance finalized");
      await load();
    } catch (error: unknown) {
      toast.error(axios.isAxiosError(error) ? error.response?.data?.message || "Attendance submission failed" : "Attendance submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Attendance history</h2>
            <p className="mt-1 text-xs text-slate-500">{percentage == null ? "No finalized sessions" : `${percentage}% present across finalized sessions`}</p>
          </div>
          {context?.isCr && <CRBadge />}
        </div>
        <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-2" role="grid" aria-label="Attendance calendar for the last 16 weeks">
          {calendar.map(({ date, records, state }) => {
            const label = `${date.toLocaleDateString()}: ${state}${records.length ? ` (${records.map((r) => `${r.session} ${r.status}`).join(", ")})` : ""}`;
            const color = state === "present" ? "bg-emerald-500 text-white" : state === "absent" ? "bg-red-500 text-white" : state === "mixed" ? "bg-amber-400 text-slate-900" : "bg-slate-100 text-slate-500";
            return <span key={dayKey(date)} tabIndex={0} title={label} aria-label={label} className={`flex h-6 w-6 items-center justify-center rounded text-[9px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 ${color}`}>{state === "present" ? "P" : state === "absent" ? "A" : state === "mixed" ? "M" : "·"}</span>;
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-slate-600" aria-label="Attendance calendar legend">
          <span><b>P</b> Present</span><span><b>A</b> Absent</span><span><b>M</b> Mixed sessions</span><span><b>·</b> Unmarked</span>
        </div>
      </section>

      {context?.isCr && (
        <form onSubmit={submit} className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800">Class attendance</h2>
          {context.canMark ? (
            <p className="mb-4 mt-1 text-xs text-slate-500">{context.currentSession} session · {new Date(context.collegeTime).toLocaleString()} ({context.timeZone})</p>
          ) : (
            <div role="alert" className="mb-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <strong className="block font-bold">Attendance marking is currently closed</strong>
              Present and Absent can only be selected from 10:00–12:00 or 12:00–15:00 college time.
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Roll no.</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {context.roster.map((student) => <tr key={student._id}><td className="px-4 py-3 font-semibold text-slate-800">{student.name}</td><td className="px-4 py-3 text-slate-500">{student.rollNo}</td><td className="px-4 py-3"><select aria-label={`Attendance status for ${student.name}`} disabled={!context.canMark} required value={statuses[student._id] || ""} onChange={(e) => setStatuses((current) => ({ ...current, [student._id]: e.target.value as Status }))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5"><option value="">Select</option><option value="present">Present</option><option value="absent">Absent</option></select></td></tr>)}
              </tbody>
            </table>
          </div>
          <button disabled={!context.canMark || !complete || submitting} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">{submitting ? "Finalizing…" : "Finalize full roster"}</button>
        </form>
      )}
    </div>
  );
}
