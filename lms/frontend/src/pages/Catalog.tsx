import { useEffect, useRef, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { api } from "../api";
import type { Book } from "../types";
import { CardGridSkeleton, ErrorState } from "../components/AsyncState";
import { Spinner } from "../components/ui/Spinner";

export default function Catalog({ canManage = false }: { canManage?: boolean }) {
  const getInitialParams = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      search: params.get("search") || "",
      category: params.get("category") || "",
      department: params.get("department") || "",
      language: params.get("language") || "",
      available: params.get("available") || "",
    };
  };

  const initialParams = getInitialParams();
  const [searchInput, setSearchInput] = useState(initialParams.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initialParams.search);
  const [category, setCategory] = useState(initialParams.category);
  const [department, setDepartment] = useState(initialParams.department);
  const [language, setLanguage] = useState(initialParams.language);
  const [available, setAvailable] = useState(initialParams.available);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateUrl = useCallback((s: string, c: string, d: string, l: string, a: string) => {
    const params = new URLSearchParams();
    if (s.trim()) params.set("search", s.trim());
    if (c) params.set("category", c);
    if (d) params.set("department", d);
    if (l) params.set("language", l);
    if (a) params.set("available", a);

    const newQuery = params.toString();
    const newRelativePathQuery = window.location.pathname + (newQuery ? `?${newQuery}` : "");
    window.history.replaceState(null, "", newRelativePathQuery);
  }, []);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 350);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchInput]);

  const fetchCatalog = useCallback(
    async (isInitial = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (isInitial) {
        setInitialLoading(true);
      } else {
        setIsSearching(true);
      }
      setError("");

      try {
        const response = await api.get("/api/catalog", {
          params: {
            search: debouncedSearch || undefined,
            category: category || undefined,
            department: department || undefined,
            language: language || undefined,
            available: available || undefined,
            page,
            limit: 24,
          },
          signal: controller.signal,
        });

        const items: Book[] = response.data.data.items || [];
        setBooks(items);
        setTotalPages(Math.max(1, response.data.data.pages || 1));
        updateUrl(debouncedSearch, category, department, language, available);

        if (items.length > 0) {
          setCategories((prev) => Array.from(new Set([...prev, ...items.map((x) => x.category).filter(Boolean)])).sort());
          setDepartments((prev) => Array.from(new Set([...prev, ...items.map((x) => x.department || "").filter(Boolean)])).sort());
        }
      } catch (err: any) {
        if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
        setError("Catalog could not be loaded.");
        toast.error("Catalog search failed.");
      } finally {
        if (isInitial) setInitialLoading(false);
        setIsSearching(false);
      }
    },
    [debouncedSearch, category, department, language, available, page, updateUrl]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setDebouncedSearch(searchInput);
    }
  };

  useEffect(() => {
    fetchCatalog(books.length === 0 && initialLoading);
  }, [debouncedSearch, category, department, language, available, page]);

  useEffect(() => { setPage(1); }, [debouncedSearch, category, department, language, available]);

  if (initialLoading) {
    return <CardGridSkeleton count={8} label="Loading library catalog" />;
  }

  if (!initialLoading && error && books.length === 0) {
    return (
      <section>
        <div className="page-heading">
          <div>
            <h1>Library Catalog</h1>
            <p>Search your college collection.</p>
          </div>
        </div>
        <ErrorState message={error} onRetry={() => fetchCatalog(true)} />
      </section>
    );
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Library Catalog</h1>
          <p>Search books by title, author, ISBN, category, department, language or accession barcode.</p>
        </div>
      </div>

      <div className="filters">
        <div className="search-input-wrapper">
          <input
            type="text"
            aria-label="Search catalog"
            placeholder="Title, author, ISBN, department, publisher..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isSearching && (
            <span className="search-spinner">
              <Spinner size="xs" label="Searching..." />
            </span>
          )}
        </div>

        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>

        <select value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>

        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">All Languages</option>
          <option value="English">English</option>
          <option value="Hindi">Hindi</option>
          <option value="Spanish">Spanish</option>
          <option value="French">French</option>
          <option value="German">German</option>
        </select>

        <select value={available} onChange={(e) => setAvailable(e.target.value)}>
          <option value="">Any Availability</option>
          <option value="true">Available</option>
          <option value="false">Unavailable</option>
        </select>
      </div>

      {books.length === 0 ? (
        <div className="empty">
          {searchInput || category || department || language || available ? (
            "No matching books found."
          ) : canManage ? (
            "Your college catalog is empty. Add a book or import the catalog from the Library Desk."
          ) : (
            "The college catalog is empty. Ask a librarian to add books."
          )}
        </div>
      ) : (
        <div className="book-grid" style={{ opacity: isSearching ? 0.75 : 1, transition: "opacity 0.2s" }}>
          {books.map((book) => {
            return (
              <article className="book-card" key={book._id} onClick={() => setSelectedBook(book)} style={{ cursor: "pointer", contentVisibility: "auto", containIntrinsicSize: "auto 250px" }}>
                <div style={{ position: "relative" }}>
                  {book.coverImage ? (
                    <img src={book.coverImage} alt={book.title} loading="lazy" decoding="async" width="92" height="250" />
                  ) : (
                    <div className="book-cover">{book.title.slice(0, 1).toUpperCase()}</div>
                  )}
                </div>

                <div className="book-content">
                  <span className="eyebrow">{book.category || "General"} {book.department ? `• ${book.department}` : ""}</span>
                  <h2>{book.title}</h2>
                  <p>{book.author}</p>
                  <dl>
                    <div>
                      <dt>ISBN</dt>
                      <dd>{book.isbn}</dd>
                    </div>
                    <div>
                      <dt>Shelf</dt>
                      <dd>{book.shelfLocation || "—"}</dd>
                    </div>
                  </dl>
                  <div className="book-footer">
                    <span className={book.availableCopies ? "available" : "unavailable"}>
                      {book.availableCopies}/{book.totalCopies} available
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && <div className="panel-heading" style={{ marginTop: 18 }}><span className="hint">Page {page} of {totalPages}</span><div><button className="secondary" disabled={page <= 1 || isSearching} onClick={() => setPage((current) => current - 1)}>Previous</button><button disabled={page >= totalPages || isSearching} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>}

      {/* Book Detail Modal */}
      {selectedBook && (
        <div className="modal-backdrop" onClick={() => setSelectedBook(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ background: "#ffffff", color: "#0f172a", maxWidth: 640, width: "100%", borderRadius: 12, padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>{selectedBook.category} • {selectedBook.department || "General"}</span>
                <h2 style={{ fontSize: "1.5rem", margin: "4px 0" }}>{selectedBook.title}</h2>
                <p style={{ color: "#475569" }}>by {selectedBook.author}</p>
              </div>
              <button onClick={() => setSelectedBook(null)} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, background: "#f8fafc", padding: 16, borderRadius: 8, marginBottom: 16, fontSize: "0.9rem" }}>
              <div><strong>ISBN:</strong> {selectedBook.isbn}</div>
              <div><strong>Publisher:</strong> {selectedBook.publisher || "—"}</div>
              <div><strong>Language:</strong> {selectedBook.language || "English"}</div>
              <div><strong>Shelf Location:</strong> {selectedBook.shelfLocation || "—"}</div>
              <div><strong>Total Copies:</strong> {selectedBook.totalCopies}</div>
              <div><strong>Available:</strong> {selectedBook.availableCopies}</div>
            </div>

            <h3 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Physical Copy Accession & Barcodes</h3>
            {selectedBook.physicalCopies && selectedBook.physicalCopies.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selectedBook.physicalCopies.map((copy) => (
                  <div key={copy.accessionNumber} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f1f5f9", borderRadius: 6, fontSize: "0.85rem" }}>
                    <div>
                      <strong>Accession #:</strong> {copy.accessionNumber} | <strong>Barcode:</strong> {copy.barcode}
                    </div>
                    <span style={{ padding: "2px 8px", borderRadius: 4, textTransform: "capitalize", background: copy.status === "available" ? "#dcfce7" : copy.status === "issued" ? "#dbeafe" : "#fee2e2", color: copy.status === "available" ? "#166534" : copy.status === "issued" ? "#1e40af" : "#991b1b" }}>
                      {copy.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#64748b", fontSize: "0.85rem" }}>Accession barcode series: {selectedBook.isbn}-001 to {selectedBook.isbn}-{String(selectedBook.totalCopies).padStart(3, "0")}</p>
            )}

            <div style={{ marginTop: 24, textAlign: "right" }}>
              <button onClick={() => setSelectedBook(null)} style={{ padding: "8px 20px", borderRadius: 6, background: "#0f172a", color: "#ffffff", border: "none", cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
