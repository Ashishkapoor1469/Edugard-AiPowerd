import { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { achievementBadgeCatalog, type AchievementCategory } from "../../data/achievementBadges.js";

type StudentOption = { _id: string; name: string; rollNo: string; class: string };

export default function AwardBadgeForm({ initialStudent, awardedBy, onClose, onAwarded }: { initialStudent: StudentOption; awardedBy?: string; onClose: () => void; onAwarded: (studentId: string, badge: object) => void }) {
  const first = achievementBadgeCatalog[0];
  const [students, setStudents] = useState<StudentOption[]>([initialStudent]);
  const [studentId, setStudentId] = useState(initialStudent._id);
  const [badgeId, setBadgeId] = useState(first.id);
  const [title, setTitle] = useState(first.name);
  const [description, setDescription] = useState(first.description);
  const [category, setCategory] = useState<AchievementCategory>(first.category);
  const [eventName, setEventName] = useState("");
  const [level, setLevel] = useState("college");
  const [awardedAt, setAwardedAt] = useState(new Date().toISOString().slice(0, 10));
  const [issuer, setIssuer] = useState(awardedBy || "");
  const [certificateUrl, setCertificateUrl] = useState("");
  const [certificate, setCertificate] = useState<File | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get("/api/students", { params: { limit: 100 } }).then(({ data }) => {
      const list = (data.data || []) as StudentOption[];
      setStudents(list.some((student) => student._id === initialStudent._id) ? list : [initialStudent, ...list]);
    }).catch(() => undefined);
  }, [initialStudent]);

  const selectBadge = (id: string) => {
    const selected = achievementBadgeCatalog.find((item) => item.id === id)!;
    setBadgeId(id); setTitle(selected.name); setDescription(selected.description); setCategory(selected.category);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const form = new FormData();
    form.append("badgeId", badgeId); form.append("title", title); form.append("description", description); form.append("category", category);
    form.append("eventName", eventName); form.append("level", level); form.append("awardedAt", awardedAt); form.append("awardedBy", issuer); form.append("certificateUrl", certificateUrl); form.append("allowDuplicate", String(allowDuplicate));
    if (certificate) form.append("certificate", certificate);
    setSaving(true);
    try {
      const response = await axios.post(`/api/students/${studentId}/badges`, form);
      toast.success("Badge awarded successfully");
      onAwarded(studentId, response.data.data);
      onClose();
    } catch (error: unknown) {
      toast.error(axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "Could not award badge" : "Could not award badge");
    } finally { setSaving(false); }
  };

  const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-[#172033] focus:border-[#3155C6] focus:outline-none focus:ring-2 focus:ring-[#3155C6]/20";
  return <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-[#132238]/70 p-4" role="dialog" aria-modal="true" aria-labelledby="award-badge-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form onSubmit={submit} className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl md:p-7">
      <div className="flex items-start justify-between gap-4"><div><h2 id="award-badge-title" className="text-xl font-black text-[#132238]">Award Badge</h2><p className="mt-1 text-xs text-slate-500">Add a verified achievement to a student profile.</p></div><button type="button" onClick={onClose} className="rounded-full border px-3 py-1 font-bold focus-visible:ring-4 focus-visible:ring-[#3155C6]/30" aria-label="Close award badge form">×</button></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">Select student<select required value={studentId} onChange={(e) => setStudentId(e.target.value)} className={field}>{students.map((student) => <option key={student._id} value={student._id}>{student.name} · {student.rollNo} · {student.class}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-700">Select badge<select required value={badgeId} onChange={(e) => selectBadge(e.target.value)} className={field}>{achievementBadgeCatalog.map((badge) => <option key={badge.id} value={badge.id}>{badge.name}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-700">Achievement title<input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={field}/></label>
        <label className="text-xs font-bold text-slate-700">Category<select required value={category} onChange={(e) => setCategory(e.target.value as AchievementCategory)} className={field}>{["leadership", "academic", "sports", "cultural", "service", "technical", "participation"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-700 md:col-span-2">Achievement description<textarea required maxLength={500} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={field}/></label>
        <label className="text-xs font-bold text-slate-700">Event name<input required maxLength={120} value={eventName} onChange={(e) => setEventName(e.target.value)} className={field} placeholder="e.g. Inter-college Tech Fest"/></label>
        <label className="text-xs font-bold text-slate-700">Achievement level<select value={level} onChange={(e) => setLevel(e.target.value)} className={field}>{["college", "university", "state", "national"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-700">Awarded date<input required type="date" max={new Date().toISOString().slice(0, 10)} value={awardedAt} onChange={(e) => setAwardedAt(e.target.value)} className={field}/></label>
        <label className="text-xs font-bold text-slate-700">Awarded by<input required maxLength={120} value={issuer} onChange={(e) => setIssuer(e.target.value)} className={field}/></label>
        <label className="text-xs font-bold text-slate-700">Certificate upload<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(e) => setCertificate(e.target.files?.[0] || null)} className={`${field} file:mr-2 file:rounded-lg file:border-0 file:bg-[#3155C6]/10 file:px-2 file:py-1 file:font-bold file:text-[#3155C6]`}/><span className="mt-1 block text-[10px] font-normal text-slate-400">PDF, PNG or JPG · max 5 MB</span></label>
        <label className="text-xs font-bold text-slate-700">Or certificate URL<input type="url" value={certificateUrl} onChange={(e) => setCertificateUrl(e.target.value)} className={field} placeholder="https://…"/></label>
      </div>
      <label className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} className="h-4 w-4 accent-[#3155C6]"/>Allow the same badge for the same event</label>
      <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 focus-visible:ring-4 focus-visible:ring-[#3155C6]/30">Cancel</button><button disabled={saving} className="rounded-xl bg-[#3155C6] px-5 py-2.5 text-sm font-black text-white shadow disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-[#3155C6]/30">{saving ? "Saving…" : "Save Badge"}</button></div>
    </form>
  </div>;
}
