import React, { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

type Librarian = { _id: string; name: string; email: string; status: string };
const empty = { name: "", email: "", password: "", status: "active" };

export default function LibrarianManagementPanel() {
  const [librarians, setLibrarians] = useState<Librarian[]>([]); const [form, setForm] = useState(empty); const [editing, setEditing] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const load = async () => { const response = await axios.get("/api/librarians"); setLibrarians(response.data.data || []); };
  useEffect(() => { load().catch(() => toast.error("Could not load librarians")); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true);
    try { if (editing) await axios.put(`/api/librarians/${editing}`, form); else await axios.post("/api/librarians", form); toast.success(editing ? "Librarian updated" : "Librarian account created"); setEditing(null); setForm(empty); await load(); }
    catch (error: any) { toast.error(error.response?.status === 401 ? "Session expired. Sign in again as college admin." : error.response?.data?.message || "Could not save librarian"); }
    finally { setLoading(false); }
  };
  const edit = (item: Librarian) => { setEditing(item._id); setForm({ name: item.name, email: item.email, password: "", status: item.status }); };
  const changeStatus = async (item: Librarian) => { await axios.put(`/api/librarians/${item._id}`, { name: item.name, email: item.email, password: "", status: item.status === "active" ? "disabled" : "active" }); await load(); };
  const remove = async (item: Librarian) => { if (!window.confirm(`Delete librarian ${item.name}?`)) return; await axios.delete(`/api/librarians/${item._id}`); toast.success("Librarian deleted"); if (editing === item._id) { setEditing(null); setForm(empty); } await load(); };
  return <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-800">Librarian accounts</h2><p className="mt-1 text-[10px] text-slate-500">Accounts are restricted to your college.</p></div><span className="rounded-lg bg-slate-50 px-3 py-1 text-[10px] font-bold text-slate-500">{librarians.length}</span></div>{librarians.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">No librarians created.</p> : librarians.map(item => <div key={item._id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-3"><div><p className="text-xs font-bold text-slate-800">{item.name}</p><p className="text-[10px] text-slate-500">{item.email} · {item.status}</p></div><div className="flex gap-2"><button onClick={() => edit(item)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold">Edit</button><button onClick={() => changeStatus(item)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold">{item.status === "active" ? "Disable" : "Enable"}</button><button onClick={() => remove(item)} className="rounded-lg bg-red-50 px-3 py-1.5 text-[10px] font-bold text-red-700">Delete</button></div></div>)}</section>
    <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"><h2 className="mb-4 text-sm font-bold text-slate-800">{editing ? "Update librarian" : "Create librarian"}</h2><div className="space-y-4"><label className="block text-[10px] font-bold uppercase text-slate-500">Name<input className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label className="block text-[10px] font-bold uppercase text-slate-500">Email<input className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label><label className="block text-[10px] font-bold uppercase text-slate-500">{editing ? "New password (optional)" : "Temporary password"}<input className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs" type="password" required={!editing} minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><span className="mt-1 block normal-case font-normal">10+ characters with uppercase, lowercase, number, and special character.</span></label><button disabled={loading} className="w-full rounded-lg bg-primary py-2.5 text-xs font-bold text-white disabled:opacity-50">{loading ? "Saving..." : editing ? "Save changes" : "Create account"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className="w-full text-xs font-bold text-slate-500">Cancel</button>}</div></form>
  </div>;
}
