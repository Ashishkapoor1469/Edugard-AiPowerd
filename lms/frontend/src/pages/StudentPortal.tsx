import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";
import type { Book, Issuance, Fine, LibraryAnnouncement } from "../types";
import { PageLoader } from "../components/AsyncState";

export default function StudentPortal() {
  const [issued, setIssued] = useState<Issuance[]>([]);
  const [wishlist, setWishlist] = useState<Book[]>([]);
  const [recommendations, setRecommendations] = useState<Book[]>([]);
  const [announcements, setAnnouncements] = useState<LibraryAnnouncement[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const meRes = await api.get("/api/auth/me");
      const studentId = meRes.data.data.id;

      const [historyRes, wishlistRes, recoRes, announceRes] = await Promise.all([
        api.get(`/api/students/${studentId}/history`),
        api.get("/api/catalog/wishlist"),
        api.get("/api/catalog/recommendations"),
        api.get("/api/announcements"),
      ]);

      setIssued(historyRes.data.data.issuances || []);
      setFines(historyRes.data.data.fines || []);
      setWishlist(wishlistRes.data.data || []);
      setRecommendations(recoRes.data.data || []);
      setAnnouncements(announceRes.data.data || []);
    } catch {
      toast.error("Failed to load student portal.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, []);

  if (loading) return <PageLoader label="Loading your library dashboard..." />;

  const activeLoans = issued.filter((i) => i.status === "active");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>My Student Library Portal</h1>
        <p style={{ color: "#64748b" }}>Manage your active loans, wishlists, recommendations, and library announcements.</p>
      </div>

      {/* Announcements Banner */}
      {announcements.length > 0 && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: 16, borderRadius: 10 }}>
          <h2 style={{ fontSize: "1.1rem", color: "#1e40af", marginBottom: 8 }}>📢 Library Announcements</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {announcements.map((a) => (
              <div key={a._id} style={{ background: "#ffffff", padding: 12, borderRadius: 6, border: "1px solid #dbeafe" }}>
                <strong style={{ color: "#1e3a8a" }}>{a.title}</strong>
                <p style={{ margin: "4px 0 0 0", color: "#334155", fontSize: "0.9rem" }}>{a.content}</p>
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Posted by {a.createdBy} on {new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Loans & Fines Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <div style={{ background: "#ffffff", padding: 20, borderRadius: 10, border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: 12 }}>📚 Active Borrowed Books ({activeLoans.length})</h2>
          {activeLoans.length === 0 ? (
            <p style={{ color: "#64748b" }}>You have no active borrowed books.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeLoans.map((loan) => {
                const isOverdue = new Date(loan.dueDate) < new Date();
                return (
                  <div key={loan._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: isOverdue ? "#fef2f2" : "#f8fafc", border: `1px solid ${isOverdue ? "#fecaca" : "#e2e8f0"}`, borderRadius: 8 }}>
                    <div>
                      <strong style={{ color: "#0f172a" }}>{loan.bookTitle}</strong>
                      <div style={{ fontSize: "0.85rem", color: "#64748b" }}>Issued: {new Date(loan.issueDate).toLocaleDateString()} | Accession: {loan.accessionNumber || "N/A"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, background: isOverdue ? "#fee2e2" : "#dcfce7", color: isOverdue ? "#991b1b" : "#166534" }}>
                        Due: {new Date(loan.dueDate).toLocaleDateString()} {isOverdue ? "(Overdue)" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fines */}
        <div style={{ background: "#ffffff", padding: 20, borderRadius: 10, border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: 12 }}>💰 Outstanding Fines</h2>
          {fines.length === 0 ? (
            <p style={{ color: "#64748b" }}>No overdue fines on your account.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fines.map((f) => (
                <div key={f._id} style={{ padding: 10, background: "#fff7ed", border: "1px solid #ffedd5", borderRadius: 6, fontSize: "0.85rem" }}>
                  <strong>{f.bookTitle}</strong>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span>Amount: ₹{f.amount}</span>
                    <span style={{ fontWeight: 600, color: f.status === "settled" ? "#16a34a" : "#dc2626" }}>{f.status.toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recommended Books */}
      <div style={{ background: "#ffffff", padding: 20, borderRadius: 10, border: "1px solid #e2e8f0" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 12 }}>✨ Recommended For Your Course</h2>
        {recommendations.length === 0 ? (
          <p style={{ color: "#64748b" }}>Explore the catalog to receive personalized recommendations.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            {recommendations.map((book) => (
              <div key={book._id} style={{ background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>{book.category}</span>
                  <h3 style={{ fontSize: "1rem", margin: "4px 0", color: "#0f172a" }}>{book.title}</h3>
                  <p style={{ fontSize: "0.85rem", color: "#475569" }}>{book.author}</p>
                </div>
                <div style={{ marginTop: 12, fontSize: "0.8rem", color: book.availableCopies > 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                  {book.availableCopies > 0 ? `${book.availableCopies} available` : "Out of Stock"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wishlist */}
      {wishlist.length > 0 && (
        <div style={{ background: "#ffffff", padding: 20, borderRadius: 10, border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: 12 }}>♥ Saved Wishlist ({wishlist.length})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            {wishlist.map((book) => (
              <div key={book._id} style={{ background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <strong style={{ fontSize: "0.95rem" }}>{book.title}</strong>
                <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "4px 0" }}>{book.author}</p>
                <div style={{ fontSize: "0.75rem", color: "#2563eb" }}>Shelf: {book.shelfLocation || "N/A"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
