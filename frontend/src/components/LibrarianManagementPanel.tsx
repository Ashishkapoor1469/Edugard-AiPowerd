import React, { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { ErrorState, ListSkeleton } from "./AsyncState.js";

type Librarian = { _id: string; name: string; email: string; status: string };
const empty = { name: "", email: "", password: "", status: "active" };

export default function LibrarianManagementPanel() {
  const [librarians, setLibrarians] = useState<Librarian[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [listError, setListError] = useState("");
  const load = async () => { setListLoading(true); setListError(""); try { const response = await axios.get("/api/librarians"); setLibrarians(response.data.data || []); } catch { setListError("Could not load librarians."); toast.error("Could not load librarians"); } finally { setListLoading(false); } };
  useEffect(() => { load(); }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true);
    try {
      if (editing) await axios.put(`/api/librarians/${editing}`, form); else await axios.post("/api/librarians", form);
      toast.success(editing ? "Librarian updated" : "Librarian account created");
      setEditing(null); setForm(empty); setShowPassword(false); await load();
    } catch (error: any) {
      toast.error(error.response?.status === 401 ? "Session expired. Sign in again as college admin." : error.response?.data?.message || "Could not save librarian");
    } finally { setLoading(false); }
  };
  const edit = (item: Librarian) => { setEditing(item._id); setForm({ name: item.name, email: item.email, password: "", status: item.status }); setShowPassword(false); };
  const generatePassword = () => { setForm({ ...form, password: `Aa1!${crypto.randomUUID().replaceAll("-", "")}` }); setShowPassword(true); };
  const copyPassword = async () => { try { await navigator.clipboard.writeText(form.password); toast.success("Password copied"); } catch { toast.error("Could not copy password"); } };
  const changeStatus = async (item: Librarian) => { setActionId(`status:${item._id}`); try { await axios.put(`/api/librarians/${item._id}`, { name: item.name, email: item.email, password: "", status: item.status === "active" ? "disabled" : "active" }); await load(); } catch { toast.error("Could not update librarian status"); } finally { setActionId(null); } };
  const remove = async (item: Librarian) => { if (!window.confirm(`Delete librarian ${item.name}?`)) return; setActionId(`delete:${item._id}`); try { await axios.delete(`/api/librarians/${item._id}`); toast.success("Librarian deleted"); if (editing === item._id) { setEditing(null); setForm(empty); } await load(); } catch { toast.error("Could not delete librarian"); } finally { setActionId(null); } };

  return <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-800">Librarian accounts</h2><p className="mt-1 text-[10px] text-slate-500">Accounts are restricted to your college.</p></div><span className="rounded-lg bg-slate-50 px-3 py-1 text-[10px] font-bold text-slate-500">{librarians.length}</span></div>
      {listLoading ? <ListSkeleton count={5} label="Loading librarians" /> : listError ? <ErrorState message={listError} onRetry={load} compact /> : librarians.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">No librarians created.</p> : librarians.map(item => <div key={item._id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-3"><div><p className="text-xs font-bold text-slate-800">{item.name}</p><p className="text-[10px] text-slate-500">{item.email} · {item.status}</p></div><div className="flex gap-2"><button disabled={actionId !== null} onClick={() => edit(item)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold disabled:opacity-50">Edit</button><button disabled={actionId !== null} onClick={() => changeStatus(item)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold disabled:opacity-50">{actionId === `status:${item._id}` ? "Updating…" : item.status === "active" ? "Disable" : "Enable"}</button><button disabled={actionId !== null} onClick={() => remove(item)} className="rounded-lg bg-red-50 px-3 py-1.5 text-[10px] font-bold text-red-700 disabled:opacity-50">{actionId === `delete:${item._id}` ? "Deleting…" : "Delete"}</button></div></div>)}
    </section>
    <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <h2 className="mb-4 text-sm font-bold text-slate-800">{editing ? "Update librarian" : "Create librarian"}</h2>
      <div className="space-y-4">
        <label className="block text-[10px] font-bold uppercase text-slate-500">Name<input className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block text-[10px] font-bold uppercase text-slate-500">Email<input className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label className="block text-[10px] font-bold uppercase text-slate-500">
          {editing ? "New password (optional)" : "Temporary password"}
          <span className="relative mt-1 block"><input className="w-full rounded-lg border border-slate-200 p-2.5 pr-10 text-xs" type={showPassword ? "text" : "password"} required={!editing} minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><button type="button" onClick={() => setShowPassword(show => !show)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 px-3 text-slate-500"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d={showPassword ? "M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.7 10.7 0 0112 4c5.5 0 9 8 9 8a16 16 0 01-2.1 3.2M6.6 6.6C4.4 8.1 3 12 3 12s3.5 8 9 8a9.8 9.8 0 004.1-.9" : "M2 12s3.5-7 10-7 10 7-3.5 7-10 7S2 12 2 12z"} />{!showPassword && <circle cx="12" cy="12" r="3" />}</svg></button></span>
          <span className="mt-1 block normal-case font-normal">10+ characters with uppercase, lowercase, number, and special character.</span>
        </label>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={generatePassword} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">{editing ? "Generate reset password" : "Generate password"}</button><button type="button" disabled={!form.password} onClick={copyPassword} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-50">Copy password</button></div>
        <button disabled={loading} className="w-full rounded-lg bg-primary py-2.5 text-xs font-bold text-white disabled:opacity-50">{loading ? "Saving..." : editing ? "Save changes" : "Create account"}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm(empty); setShowPassword(false); }} className="w-full text-xs font-bold text-slate-500">Cancel</button>}
      </div>
    </form>
  </div>;
}
