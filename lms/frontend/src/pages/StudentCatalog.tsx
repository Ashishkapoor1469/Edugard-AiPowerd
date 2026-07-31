import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, idempotency } from "../api";
import type { Book, User } from "../types";

export default function StudentCatalog({ user }: { user: User }) {
  const [books, setBooks] = useState<Book[]>([]); const [search, setSearch] = useState(""); const [category, setCategory] = useState(""); const [available, setAvailable] = useState(""); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const r = await api.get("/api/catalog", { params: { search: search || undefined, category: category || undefined, available: available || undefined, limit: 60 } }); setBooks(r.data.data.items); } catch { toast.error("Catalog could not be loaded"); } finally { setLoading(false); } };
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [search, category, available]);
  const reserve = async (book: Book) => { try { await api.post("/api/circulation/reservations", { studentId: user.id, bookId: book._id }, idempotency()); toast.success("Hold request placed"); } catch (e: any) { toast.error(e.response?.data?.message || "Reservation failed"); } };
  const categories = [...new Set(books.map(x => x.category).filter(Boolean))].sort();
  return <section><div className="page-heading"><div><h1>Library catalog</h1><p>Search your college collection and reserve unavailable titles.</p></div></div>
    <div className="filters"><input aria-label="Search catalog" placeholder="Title, author, ISBN or category" value={search} onChange={e => setSearch(e.target.value)} /><select value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{categories.map(x => <option key={x}>{x}</option>)}</select><select value={available} onChange={e => setAvailable(e.target.value)}><option value="">Any availability</option><option value="true">Available</option><option value="false">Unavailable</option></select></div>
    {loading ? <div className="empty">Loading catalog…</div> : books.length === 0 ? <div className="empty">No matching books.</div> : <div className="book-grid">{books.map(book => <article className="book-card" key={book._id}>{book.coverImage ? <img src={book.coverImage} alt="" /> : <div className="book-cover">{book.title.slice(0, 1)}</div>}<div className="book-content"><span className="eyebrow">{book.category || "General"}</span><h2>{book.title}</h2><p>{book.author}</p><dl><div><dt>ISBN</dt><dd>{book.isbn}</dd></div><div><dt>Shelf</dt><dd>{book.shelfLocation || "—"}</dd></div></dl><div className="book-footer"><span className={book.availableCopies ? "available" : "unavailable"}>{book.availableCopies}/{book.totalCopies} available</span>{user.role === "student" && book.availableCopies === 0 && <button onClick={() => reserve(book)}>Reserve</button>}</div></div></article>)}</div>}
  </section>;
}
