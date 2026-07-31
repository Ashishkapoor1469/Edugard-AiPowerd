import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";
import type { Fine, Issuance, Reservation, User } from "../types";

export default function MyLibrary({ user }: { user: User }) {
  const [issues, setIssues] = useState<Issuance[]>([]); const [reservations, setReservations] = useState<Reservation[]>([]); const [fines, setFines] = useState<Fine[]>([]);
  const load = async () => { try { const [a, b, c] = await Promise.all([api.get("/api/circulation/issuances"), api.get("/api/circulation/reservations"), api.get("/api/library-admin/fines")]); setIssues(a.data.data); setReservations(b.data.data); setFines(c.data.data); } catch { toast.error("Your library account could not be loaded"); } };
  useEffect(() => { load(); }, [user.id]);
  const cancel = async (id: string) => { await api.delete(`/api/circulation/reservations/${id}`); toast.success("Reservation cancelled"); load(); };
  return <section><div className="page-heading"><div><h1>My library</h1><p>Current and previous loans, holds, and recorded fines.</p></div></div>
    <div className="metric-row"><div><strong>{issues.filter(x => x.status === "active").length}</strong><span>Active loans</span></div><div><strong>{reservations.filter(x => x.status === "queued" || x.status === "ready").length}</strong><span>Active holds</span></div><div><strong>{fines.reduce((n, x) => n + Math.max(0, x.amount - x.paidAmount - x.waivedAmount), 0).toFixed(2)}</strong><span>Outstanding fines</span></div></div>
    <div className="panel"><h2>Loans</h2><TableEmpty items={issues} label="No library loans yet." />{issues.length > 0 && <table><thead><tr><th>Book</th><th>Issued</th><th>Due</th><th>Status</th></tr></thead><tbody>{issues.map(x => <tr key={x._id}><td>{x.bookTitle}</td><td>{new Date(x.issueDate).toLocaleDateString()}</td><td>{new Date(x.dueDate).toLocaleDateString()}</td><td><span className={`status ${x.status}`}>{x.status}</span></td></tr>)}</tbody></table>}</div>
    <div className="two-columns"><div className="panel"><h2>Reservations</h2><TableEmpty items={reservations} label="No reservations." />{reservations.map(x => <div className="list-row" key={x._id}><div><strong>{x.bookTitle}</strong><small>{x.status}</small></div>{(x.status === "queued" || x.status === "ready") && <button className="secondary" onClick={() => cancel(x._id)}>Cancel</button>}</div>)}</div><div className="panel"><h2>Fines</h2><TableEmpty items={fines} label="No fines recorded." />{fines.map(x => <div className="list-row" key={x._id}><div><strong>{x.bookTitle}</strong><small>{x.status}</small></div><b>{Math.max(0, x.amount - x.paidAmount - x.waivedAmount).toFixed(2)}</b></div>)}</div></div>
  </section>;
}
function TableEmpty({ items, label }: { items: unknown[]; label: string }) { return items.length === 0 ? <p className="empty small">{label}</p> : null; }
