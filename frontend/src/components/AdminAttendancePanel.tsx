import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { ErrorState, TableSkeleton } from "./AsyncState.js";

interface Student { _id: string; name: string; rollNo: string; classId: string; }
interface RecordRow { record: { _id: string; studentId: string; date: string; session: string; status: string; classId: string; auditHistory: unknown[] }; student: { name: string; rollNo: string } | null; }
interface LeaderRow { assignment: { _id: string; classId: string; leadershipType: string; startDate: string; endDate?: string; isActive: boolean }; student: { name: string; rollNo: string } | null; }

export default function AdminAttendancePanel({ view }: { view: "attendance" | "leaders" }) {
  const [roster, setRoster] = useState<Student[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [session, setSession] = useState("");
  const [summary, setSummary] = useState({ total: 0, present: 0, absent: 0, unmarked: 0 });
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [studentId, setStudentId] = useState("");
  const [leadershipType, setLeadershipType] = useState("CR");
  const [assigning, setAssigning] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingLeaders, setLoadingLeaders] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{ id: string; status: string; reason: string } | null>(null);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [leadersError, setLeadersError] = useState("");

  const classes = useMemo(() => [...new Set(roster.map((student) => student.classId).filter(Boolean))].sort(), [roster]);
  const studentsForClass = roster.filter((student) => !classId || student.classId === classId);
  const dayState = (record: RecordRow["record"]) => {
    const day = records.filter((row) => row.record.studentId === record.studentId && row.record.date === record.date).map((row) => row.record);
    const morning = day.some((item) => item.session === "morning" && item.status === "present");
    const afternoon = day.some((item) => item.session === "afternoon" && item.status === "present");
    return day.some((item) => item.status === "leave") ? { label: "Leave", color: "bg-orange-500" } : morning && afternoon ? { label: "Full day", color: "bg-emerald-500" } : morning || afternoon ? { label: "Half day", color: "bg-emerald-500/50" } : { label: "Absent", color: "bg-red-500" };
  };

  const loadRoster = async () => {
    setRosterLoading(true); setRosterError("");
    try { const response = await axios.get("/api/attendance/admin/roster"); setRoster(response.data.data || []); }
    catch { setRosterError("Failed to load roster."); toast.error("Failed to load roster"); }
    finally { setRosterLoading(false); }
  };
  const loadSummary = async () => {
    setLoadingSummary(true);
    setSummaryError("");
    try {
      const response = await axios.get("/api/attendance/admin/summary", { params: { classId: classId || undefined, date, session: session || undefined } });
      setSummary(response.data.summary);
      setRecords(response.data.data || []);
    } catch { setSummaryError("Failed to load attendance summary."); toast.error("Failed to load attendance summary"); }
    finally { setLoadingSummary(false); }
  };
  const loadLeaders = async () => {
    setLoadingLeaders(true);
    setLeadersError("");
    try {
      const response = await axios.get("/api/attendance/admin/leaders");
      setLeaders(response.data.data || []);
    } catch { setLeadersError("Failed to load student leaders."); toast.error("Failed to load student leaders"); }
    finally { setLoadingLeaders(false); }
  };

  // Fetch when the selected dashboard view mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadRoster(); }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (view === "attendance") loadSummary(); else loadLeaders(); }, [view]);

  const correct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!correction) return;
    setCorrecting(true);
    try {
      await axios.patch(`/api/attendance/admin/records/${correction.id}`, { status: correction.status, reason: correction.reason });
      toast.success("Attendance corrected and audited");
      setCorrection(null);
      await loadSummary();
    } catch (error: unknown) { toast.error(axios.isAxiosError(error) ? error.response?.data?.message || "Correction failed" : "Correction failed"); }
    finally { setCorrecting(false); }
  };

  const revoke = async (id: string) => {
    setRevokingId(id);
    try { await axios.post(`/api/attendance/admin/leaders/${id}/revoke`); toast.success("Assignment revoked"); await loadLeaders(); }
    catch { toast.error("Could not revoke assignment"); }
    finally { setRevokingId(null); }
  };

  const assign = async (event: React.FormEvent) => {
    event.preventDefault();
    const student = roster.find((item) => item._id === studentId);
    if (!student) return;
    setAssigning(true);
    try {
      await axios.post("/api/attendance/admin/leaders", { studentId, classId: student.classId, leadershipType });
      toast.success("Student leader assigned");
      setStudentId("");
      await loadLeaders();
    } catch (error: unknown) { toast.error(axios.isAxiosError(error) ? error.response?.data?.message || "Assignment failed" : "Assignment failed"); }
    finally { setAssigning(false); }
  };

  if (view === "leaders") return (
    <div className="space-y-6">
      {rosterLoading ? <TableSkeleton rows={7} columns={4} label="Loading student roster" /> : rosterError ? <ErrorState message={rosterError} onRetry={loadRoster} /> : null}
      {!loadingLeaders && leadersError && <ErrorState message={leadersError} onRetry={loadLeaders} />}
      <form onSubmit={assign} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-800">Assign student leader</h2>
        <p className="mb-4 mt-1 text-[10px] text-slate-500">CR remains a student account; authority is checked from the active assignment on every request.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <select aria-label="Class" value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId(""); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="">All classes</option>{classes.map((name) => <option key={name}>{name}</option>)}</select>
          <select required aria-label="Student" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="">Choose student</option>{studentsForClass.map((student) => <option key={student._id} value={student._id}>{student.name} · {student.rollNo} · {student.classId}</option>)}</select>
          <input required aria-label="Leadership type" value={leadershipType} onChange={(e) => setLeadershipType(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
        </div>
        <button disabled={assigning} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-primary/70">
          {assigning && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {assigning ? "Assigning…" : "Assign leader"}
        </button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        {loadingLeaders ? <p className="p-8 text-center text-xs text-slate-500">Loading student leaders…</p> : <table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{leaders.map(({ assignment, student }) => <tr key={assignment._id}><td className="px-4 py-3 font-semibold">{student?.name || "Unknown"}<span className="block text-[10px] font-normal text-slate-400">{student?.rollNo}</span></td><td className="px-4 py-3">{assignment.classId}</td><td className="px-4 py-3">{assignment.leadershipType}</td><td className="px-4 py-3">{assignment.isActive ? "Active" : "Revoked"}</td><td className="px-4 py-3">{assignment.isActive && <button disabled={revokingId !== null} onClick={() => revoke(assignment._id)} className="rounded-lg border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-bold text-red-700 disabled:opacity-50">{revokingId === assignment._id ? "Revoking…" : "Revoke"}</button>}</td></tr>)}</tbody></table>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {rosterLoading ? <TableSkeleton rows={7} columns={4} label="Loading student roster" /> : rosterError ? <ErrorState message={rosterError} onRetry={loadRoster} /> : null}
      {!loadingSummary && summaryError && <ErrorState message={summaryError} onRetry={loadSummary} />}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="grid gap-3 md:grid-cols-4">
          <select aria-label="Class filter" value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="">All classes</option>{classes.map((name) => <option key={name}>{name}</option>)}</select>
          <input aria-label="Attendance date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
          <select aria-label="Session filter" value={session} onChange={(e) => setSession(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="">Both sessions</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option></select>
          <button disabled={loadingSummary} onClick={loadSummary} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{loadingSummary ? "Loading…" : "Apply filters"}</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(summary).map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><span className="block text-[10px] font-bold uppercase text-slate-500">{label}</span><span className="mt-1 block text-2xl font-bold text-slate-800">{value}</span></div>)}</div>
      </section>
      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs" aria-label="Daily attendance states">
        {records.filter((row, index, all) => index === all.findIndex((item) => item.record.studentId === row.record.studentId && item.record.date === row.record.date)).map(({ record, student }) => {
          const state = dayState(record);
          return <span key={`${record.studentId}-${record.date}`} title={`${student?.name || "Unknown"}: ${state.label}`} className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-700"><span className={`h-2.5 w-2.5 rounded-full ${state.color}`} />{student?.name || "Unknown"} · {state.label}</span>;
        })}
        {loadingSummary ? <span className="text-xs text-slate-400">Loading attendance…</span> : records.length === 0 && <span className="text-xs text-slate-400">No attendance states for this selection.</span>}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Session</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Audit</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{records.map(({ record, student }) => <tr key={record._id}><td className="px-4 py-3 font-semibold">{student?.name || "Unknown"}<span className="block text-[10px] font-normal text-slate-400">{student?.rollNo}</span></td><td className="px-4 py-3">{record.classId}</td><td className="px-4 py-3 capitalize">{record.session}</td><td className="px-4 py-3 capitalize">{record.status}</td><td className="px-4 py-3">{record.auditHistory?.length || 0}</td><td className="px-4 py-3"><button onClick={() => setCorrection({ id: record._id, status: record.status === "present" ? "absent" : "present", reason: "" })} className="rounded-lg border border-primary/15 px-3 py-1 text-[10px] font-bold text-primary">Correct</button></td></tr>)}</tbody></table>
      </div>
      {correction && <form onSubmit={correct} className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="text-sm font-bold text-slate-800">Locked-record correction</h3><div className="mt-3 flex flex-col gap-3 md:flex-row"><select disabled={correcting} value={correction.status} onChange={(e) => setCorrection({ ...correction, status: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="present">Present</option><option value="absent">Absent</option><option value="leave">Leave</option></select><input disabled={correcting} required minLength={3} aria-label="Mandatory correction reason" placeholder="Mandatory reason" value={correction.reason} onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button disabled={correcting} className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{correcting ? "Saving…" : "Save audited correction"}</button><button disabled={correcting} type="button" onClick={() => setCorrection(null)} className="px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">Cancel</button></div></form>}
    </div>
  );
}
