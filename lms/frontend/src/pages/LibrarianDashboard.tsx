import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, idempotency } from "../api";
import type { Book, EduGuardStudent, Fine, Issuance, LibraryStudent, Reservation, User } from "../types";
import { ErrorState, ButtonLoadingContent, ListSkeleton, TableSkeleton } from "../components/AsyncState";

type Tab = "students" | "catalog" | "circulation" | "reservations" | "overdue" | "settings";

export default function LibrarianDashboard({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>("students");
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Library desk</h1>
          <p>Catalog, circulation, reservations, overdue follow-up, and fines for your college.</p>
        </div>
        <span className="role-pill">Librarian</span>
      </div>
      <div className="tabs">
        {(["students", "catalog", "circulation", "reservations", "overdue", "settings"] as Tab[]).map((x) => (
          <button key={x} className={tab === x ? "active" : ""} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>
      {tab === "students" && <Students />}
      {tab === "catalog" && <CatalogManager />}
      {tab === "circulation" && <Circulation />}
      {tab === "reservations" && <Reservations />}
      {tab === "overdue" && <OverdueFines />}
      {tab === "settings" && <Preferences user={user} />}
    </section>
  );
}

function Students() {
  const [students, setStudents] = useState<LibraryStudent[]>([]);
  const [results, setResults] = useState<EduGuardStudent[]>([]);
  const [mode, setMode] = useState<"edugard" | "manual">("edugard");
  const [filters, setFilters] = useState({ search: "", course: "", className: "" });
  const [manual, setManual] = useState({ name: "", rollNo: "", email: "", phoneNo: "", course: "", className: "", semester: 1 });
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [savingManual, setSavingManual] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api.get("/api/students");
      setStudents(r.data.data);
    } catch {
      setError("Students could not be loaded.");
      toast.error("Students could not be loaded");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const find = async (event: React.FormEvent) => {
    event.preventDefault();
    setSearching(true);
    try {
      const r = await api.get("/api/students/search-eduguard", { params: filters });
      setResults(r.data.data);
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Student search failed");
    } finally {
      setSearching(false);
    }
  };

  const register = async (student: EduGuardStudent) => {
    setRegisteringId(student.id);
    try {
      await api.post(`/api/students/${student.id}`);
      toast.success(`${student.name} registered in LMS`);
      setResults((items) => items.map((x) => (x.id === student.id ? { ...x, registered: true } : x)));
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Student registration failed");
    } finally {
      setRegisteringId(null);
    }
  };

  const registerManual = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingManual(true);
    try {
      await api.post("/api/students/manual", manual);
      toast.success(`${manual.name} registered in LMS`);
      setManual({ name: "", rollNo: "", email: "", phoneNo: "", course: "", className: "", semester: 1 });
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Manual registration failed");
    } finally {
      setSavingManual(false);
    }
  };

  if (loading) return <ListSkeleton count={7} label="Loading registered students" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <div className="tabs">
        <button className={mode === "edugard" ? "active" : ""} onClick={() => setMode("edugard")}>
          Add from EduGuard
        </button>
        <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>
          Manual LMS entry
        </button>
      </div>
      <div className="two-columns">
        <div className="panel">
          {mode === "edugard" ? (
            <>
              <h2>Add from EduGuard</h2>
              <p className="hint">Search approved students in your assigned college only.</p>
              <form className="form-stack" onSubmit={find}>
                <label>
                  Name, roll number, or email
                  <input disabled={searching} minLength={2} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
                </label>
                <label>
                  Course / degree
                  <input disabled={searching} value={filters.course} onChange={(e) => setFilters({ ...filters, course: e.target.value })} />
                </label>
                <label>
                  Class
                  <input disabled={searching} value={filters.className} onChange={(e) => setFilters({ ...filters, className: e.target.value })} />
                </label>
                <button disabled={searching || !Object.values(filters).some((x) => x.trim())}>
                  {searching ? <ButtonLoadingContent label="Searching…" /> : "Search EduGuard"}
                </button>
              </form>
              {results.map((x) => (
                <div className="list-row" key={x.id}>
                  <div>
                    <strong>{x.name}</strong>
                    <small>
                      {x.rollNo} · {x.course} · {x.className} · semester {x.semester}
                    </small>
                    <small>{x.email}{x.phoneNo ? ` · ${x.phoneNo}` : ""}</small>
                  </div>
                  <button disabled={x.registered || registeringId !== null} onClick={() => register(x)}>
                    {registeringId === x.id ? <ButtonLoadingContent label="Registering…" /> : x.registered ? "Registered" : "Register in LMS"}
                  </button>
                </div>
              ))}
            </>
          ) : (
            <form className="form-stack" onSubmit={registerManual}>
              <h2>Manual LMS entry</h2>
              <p className="hint">Creates an LMS-only member in your assigned college; it does not create an EduGuard login.</p>
              <label>
                Name
                <input disabled={savingManual} required value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
              </label>
              <label>
                Roll number
                <input disabled={savingManual} required value={manual.rollNo} onChange={(e) => setManual({ ...manual, rollNo: e.target.value })} />
              </label>
              <label>
                Email
                <input disabled={savingManual} required type="email" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
              </label>
              <label>
                Phone
                <input disabled={savingManual} value={manual.phoneNo} onChange={(e) => setManual({ ...manual, phoneNo: e.target.value })} />
              </label>
              <label>
                Course / degree
                <input disabled={savingManual} value={manual.course} onChange={(e) => setManual({ ...manual, course: e.target.value })} />
              </label>
              <label>
                Class
                <input disabled={savingManual} value={manual.className} onChange={(e) => setManual({ ...manual, className: e.target.value })} />
              </label>
              <label>
                Semester
                <input
                  disabled={savingManual}
                  required
                  type="number"
                  min="1"
                  max="12"
                  value={manual.semester}
                  onChange={(e) => setManual({ ...manual, semester: Number(e.target.value) })}
                />
              </label>
              <button disabled={savingManual}>
                {savingManual ? <ButtonLoadingContent label="Registering…" /> : "Register LMS student"}
              </button>
            </form>
          )}
        </div>
        <div className="panel">
          <h2>Registered LMS students</h2>
          {loading ? (
            <ListSkeleton count={7} label="Loading students" />
          ) : students.length === 0 ? (
            <p className="empty small">No students registered.</p>
          ) : (
            students.map((x) => (
              <div className="list-row" key={x._id}>
                <div>
                  <strong>{x.name}</strong>
                  <small>
                    {x.rollNo} · {x.course} · {x.className} · semester {x.semester}
                  </small>
                  <small>{x.email}{x.phoneNo ? ` · ${x.phoneNo}` : ""}</small>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

const blankBook = { _id: "", isbn: "", title: "", author: "", category: "", totalCopies: 1, availableCopies: 0, shelfLocation: "", coverImage: "", borrowCount: 0 };
function CatalogManager() {
  const [books, setBooks] = useState<Book[]>([]);
  const [form, setForm] = useState<Book>(blankBook);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api.get("/api/catalog", { params: { limit: 100 } });
      setBooks(r.data.data.items);
    } catch {
      setError("Catalog could not be loaded.");
      toast.error("Catalog could not be loaded");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      form._id ? await api.put(`/api/catalog/${form._id}`, form) : await api.post("/api/catalog", form);
      toast.success(form._id ? "Book updated" : "Book added");
      setForm(blankBook);
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Book could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    const data = new FormData();
    data.append("file", file);
    try {
      const r = await api.post("/api/catalog/import", data);
      toast.success(`${r.data.imported} books imported`);
      setFile(null);
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (book: Book) => {
    if (!confirm(`Delete ${book.title}?`)) return;
    setDeletingId(book._id);
    try {
      await api.delete(`/api/catalog/${book._id}`);
      toast.success("Book deleted");
      if (form._id === book._id) setForm(blankBook);
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Book could not be deleted");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <TableSkeleton rows={8} columns={6} label="Loading catalog" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="two-columns wide-left">
      <div className="panel">
        <div className="panel-heading">
          <h2>Catalog</h2>
          <div>
            <input disabled={uploading} type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button onClick={upload} disabled={!file || uploading}>
              {uploading ? <ButtonLoadingContent label="Importing…" /> : "Import Excel"}
            </button>
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={8} columns={6} label="Loading catalog" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>ISBN</th>
                <th>Category</th>
                <th>Copies</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {books.map((x) => (
                <tr key={x._id}>
                  <td>
                    <strong>{x.title}</strong>
                    <small>{x.author}</small>
                  </td>
                  <td>{x.isbn}</td>
                  <td>{x.category}</td>
                  <td>
                    {x.availableCopies}/{x.totalCopies}
                  </td>
                  <td>
                    <button disabled={saving || uploading || deletingId !== null} className="secondary" onClick={() => setForm(x)}>
                      Edit
                    </button>
                    <button disabled={saving || uploading || deletingId !== null} className="secondary" onClick={() => remove(x)}>
                      {deletingId === x._id ? <ButtonLoadingContent label="Deleting…" /> : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <form className="panel form-stack" onSubmit={save}>
        <h2>{form._id ? "Edit book" : "Add book"}</h2>
        <label>
          Title
          <input disabled={saving} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          Author
          <input disabled={saving} required value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
        </label>
        <label>
          ISBN
          <input disabled={saving} required value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
        </label>
        <label>
          Category
          <input disabled={saving} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </label>
        <label>
          Total copies
          <input
            disabled={saving}
            type="number"
            min="0"
            required
            value={form.totalCopies}
            onChange={(e) => setForm({ ...form, totalCopies: Number(e.target.value) })}
          />
        </label>
        <label>
          Shelf location
          <input disabled={saving} value={form.shelfLocation} onChange={(e) => setForm({ ...form, shelfLocation: e.target.value })} />
        </label>
        <label>
          Cover image URL
          <input disabled={saving} value={form.coverImage} onChange={(e) => setForm({ ...form, coverImage: e.target.value })} />
        </label>
        <button disabled={saving} type="submit">
          {saving ? <ButtonLoadingContent label="Saving…" /> : form._id ? "Save changes" : "Add book"}
        </button>
        {form._id && (
          <button disabled={saving} type="button" className="secondary" onClick={() => setForm(blankBook)}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}

function Circulation() {
  const [issues, setIssues] = useState<Issuance[]>([]);
  const [students, setStudents] = useState<LibraryStudent[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [studentId, setStudentId] = useState("");
  const [bookId, setBookId] = useState("");
  const [loanDays, setLoanDays] = useState(15);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [a, b, c] = await Promise.all([
        api.get("/api/circulation/issuances", { params: { status: "active" } }),
        api.get("/api/students"),
        api.get("/api/catalog", { params: { available: true, limit: 100 } }),
      ]);
      setIssues(a.data.data);
      setStudents(b.data.data);
      setBooks(c.data.data.items);
    } catch {
      setError("Circulation could not be loaded.");
      toast.error("Circulation could not be loaded");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const issue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssuing(true);
    try {
      await api.post("/api/circulation/issue", { studentId, bookId, loanDays }, idempotency());
      toast.success("Book issued");
      setStudentId("");
      setBookId("");
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Issue failed");
    } finally {
      setIssuing(false);
    }
  };

  const action = async (id: string, kind: "return" | "renew") => {
    setBusy(`${kind}:${id}`);
    try {
      await api.post(`/api/circulation/${id}/${kind}`, {}, idempotency());
      toast.success(kind === "return" ? "Book returned" : "Loan renewed");
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || `${kind} failed`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <TableSkeleton rows={8} columns={6} label="Loading circulation" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="two-columns">
      <form className="panel form-stack" onSubmit={issue}>
        <h2>Issue a book</h2>
        <label>
          Registered student
          <select disabled={issuing} required value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select student</option>
            {students.map((x) => (
              <option key={x._id} value={x.eduGuardStudentId}>
                {x.name} · {x.rollNo}
              </option>
            ))}
          </select>
        </label>
        <label>
          Available book
          <select disabled={issuing || loading} required value={bookId} onChange={(e) => setBookId(e.target.value)}>
            <option value="">Select book</option>
            {books.map((x) => (
              <option key={x._id} value={x._id}>
                {x.title} · ISBN {x.isbn} · {x.availableCopies} available
              </option>
            ))}
          </select>
        </label>
        <label>
          Loan period
          <select disabled={issuing} value={loanDays} onChange={(e) => setLoanDays(Number(e.target.value))}>
            <option value={10}>10 days</option>
            <option value={15}>15 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
        <button disabled={issuing || loading || books.length === 0}>
          {issuing ? <ButtonLoadingContent label="Issuing…" /> : "Issue book"}
        </button>
        <p className="hint">Register students from EduGuard before issuing books.</p>
      </form>
      <div className="panel">
        <h2>Active issuances</h2>
        {loading ? (
          <TableSkeleton rows={8} columns={6} label="Loading issuances" />
        ) : issues.length === 0 ? (
          <p className="empty small">No active issuances.</p>
        ) : (
          issues.map((x) => {
            const student = students.find((s) => s.eduGuardStudentId === x.studentId);
            return (
              <div className="list-row" key={x._id}>
                <div>
                  <strong>{x.bookTitle}</strong>
                  <small>
                    {student ? `${student.name} · ${student.rollNo}` : x.studentId} · {x.loanDays || 15} days · due{" "}
                    {new Date(x.dueDate).toLocaleDateString()}
                  </small>
                </div>
                <div>
                  <button disabled={busy !== null} className="secondary" onClick={() => action(x._id, "renew")}>
                    {busy === `renew:${x._id}` ? <ButtonLoadingContent label="Renewing…" /> : "Renew"}
                  </button>
                  <button disabled={busy !== null} onClick={() => action(x._id, "return")}>
                    {busy === `return:${x._id}` ? <ButtonLoadingContent label="Returning…" /> : "Return"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Reservations() {
  const [items, setItems] = useState<Reservation[]>([]);
  const [students, setStudents] = useState<LibraryStudent[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [studentId, setStudentId] = useState("");
  const [bookId, setBookId] = useState("");
  const [loanDays, setLoanDays] = useState(15);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [a, b, c] = await Promise.all([
        api.get("/api/circulation/reservations"),
        api.get("/api/students"),
        api.get("/api/catalog", { params: { available: false, limit: 100 } }),
      ]);
      setItems(a.data.data);
      setStudents(b.data.data);
      setBooks(c.data.data.items);
    } catch {
      setError("Reservations could not be loaded.");
      toast.error("Reservations could not be loaded");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reserve = async (event: React.FormEvent) => {
    event.preventDefault();
    setReserving(true);
    try {
      await api.post("/api/circulation/reservations", { studentId, bookId, loanDays }, idempotency());
      setStudentId("");
      setBookId("");
      toast.success("Reservation created");
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Reservation failed");
    } finally {
      setReserving(false);
    }
  };

  const cancel = async (id: string) => {
    setCancellingId(id);
    try {
      await api.delete(`/api/circulation/reservations/${id}`);
      toast.success("Reservation cancelled");
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Cancellation failed");
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) return <TableSkeleton rows={8} columns={5} label="Loading reservations" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="two-columns">
      <form className="panel form-stack" onSubmit={reserve}>
        <h2>Create reservation</h2>
        <label>
          Registered student
          <select disabled={reserving} required value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select student</option>
            {students.map((x) => (
              <option key={x._id} value={x.eduGuardStudentId}>
                {x.name} · {x.rollNo}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unavailable book
          <select disabled={reserving || loading} required value={bookId} onChange={(e) => setBookId(e.target.value)}>
            <option value="">{books.length ? "Select book" : "No unavailable books"}</option>
            {books.map((x) => (
              <option key={x._id} value={x._id}>
                {x.title} · ISBN {x.isbn}
              </option>
            ))}
          </select>
        </label>
        <label>
          Requested loan period
          <select disabled={reserving} value={loanDays} onChange={(e) => setLoanDays(Number(e.target.value))}>
            <option value={10}>10 days</option>
            <option value={15}>15 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
        <button disabled={reserving || loading || books.length === 0}>
          {reserving ? <ButtonLoadingContent label="Creating…" /> : "Create reservation"}
        </button>
        <p className="hint">Reservations are only needed when every copy is currently issued.</p>
      </form>
      <div className="panel">
        <h2>Reservations</h2>
        {loading ? (
          <TableSkeleton rows={8} columns={5} label="Loading reservations" />
        ) : items.length === 0 ? (
          <p className="empty small">No reservations.</p>
        ) : (
          items.map((x) => {
            const student = students.find((s) => s.eduGuardStudentId === x.studentId);
            return (
              <div className="list-row" key={x._id}>
                <div>
                  <strong>{x.bookTitle}</strong>
                  <small>
                    {student ? `${student.name} · ${student.rollNo}` : x.studentId} · {x.loanDays || 15} days · {x.status}
                  </small>
                </div>
                <button disabled={cancellingId !== null} className="secondary" onClick={() => cancel(x._id)}>
                  {cancellingId === x._id ? <ButtonLoadingContent label="Cancelling…" /> : "Cancel"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function OverdueFines() {
  const [overdue, setOverdue] = useState<Issuance[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [a, b] = await Promise.all([api.get("/api/circulation/overdue"), api.get("/api/library-admin/fines")]);
      setOverdue(a.data.data);
      setFines(b.data.data);
    } catch {
      setError("Overdue data could not be loaded.");
      toast.error("Overdue data could not be loaded");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const fineAction = async (fine: Fine, kind: "payment" | "waive") => {
    const raw = prompt(`${kind} amount`);
    if (!raw) return;
    const reason = kind === "waive" ? prompt("Waiver reason") : undefined;
    setBusy(`${kind}:${fine._id}`);
    try {
      await api.post(`/api/library-admin/fines/${fine._id}/${kind}`, { amount: Number(raw), reason });
      toast.success("Fine updated");
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Fine update failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <TableSkeleton rows={8} columns={6} label="Loading overdue loans and fines" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="two-columns">
      <div className="panel">
        <h2>Overdue loans</h2>
        {overdue.length === 0 ? (
          <p className="empty small">No overdue loans.</p>
        ) : (
          overdue.map((x) => (
            <div className="list-row" key={x._id}>
              <div>
                <strong>{x.bookTitle}</strong>
                <small>Student {x.studentId}</small>
              </div>
              <span className="status overdue">Due {new Date(x.dueDate).toLocaleDateString()}</span>
            </div>
          ))
        )}
      </div>
      <div className="panel">
        <h2>Fine tracking</h2>
        {fines.length === 0 ? (
          <p className="empty small">No fines on record.</p>
        ) : (
          fines.map((x) => (
            <div className="list-row" key={x._id}>
              <div>
                <strong>{x.bookTitle}</strong>
                <small>
                  {x.status} · student {x.studentId}
                </small>
              </div>
              <div>
                <b>{(x.amount - x.paidAmount - x.waivedAmount).toFixed(2)}</b>
                <button disabled={busy !== null} className="secondary" onClick={() => fineAction(x, "payment")}>
                  {busy === `payment:${x._id}` ? <ButtonLoadingContent label="Saving…" /> : "Record payment"}
                </button>
                <button disabled={busy !== null} className="secondary" onClick={() => fineAction(x, "waive")}>
                  {busy === `waive:${x._id}` ? <ButtonLoadingContent label="Saving…" /> : "Waive"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Preferences({ user }: { user: User }) {
  const [prefs, setPrefs] = useState<any>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    api
      .get("/api/library-admin/preferences")
      .then((r) => setPrefs(r.data.data))
      .catch(() => setError("Settings could not be loaded."));
  };

  useEffect(load, [user.id]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!prefs) return <ListSkeleton count={5} label="Loading settings" />;

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/api/library-admin/preferences", prefs);
      toast.success("Notification preferences saved");
    } catch {
      toast.error("Preferences could not be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel form-stack settings-panel">
      <h2>Notification preferences</h2>
      <label>
        Overdue digest
        <select disabled={saving} value={prefs.overdueDigest} onChange={(e) => setPrefs({ ...prefs, overdueDigest: e.target.value })}>
          <option value="daily">Daily</option>
          <option value="off">Off</option>
        </select>
      </label>
      {[
        ["reservationAlerts", "Reservation-ready alerts"],
        ["fineAlerts", "Fine threshold alerts"],
        ["lowStockAlerts", "Low-stock alerts"],
      ].map(([key, label]) => (
        <label className="check" key={key}>
          <input disabled={saving} type="checkbox" checked={prefs[key]} onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })} />
          {label}
        </label>
      ))}
      <button disabled={saving} onClick={save}>
        {saving ? <ButtonLoadingContent label="Saving…" /> : "Save preferences"}
      </button>
    </div>
  );
}
