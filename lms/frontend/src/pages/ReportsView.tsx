import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";
import { PageLoader } from "../components/AsyncState";

interface ReportTotals {
  issuances: number;
  active: number;
  overdue: number;
  fineCollected: number;
  fineWaived: number;
}

interface ClassUsage {
  className: string;
  total: number;
  active: number;
  overdue: number;
}

interface MostBorrowedBook {
  _id: string;
  title: string;
  author: string;
  borrowCount: number;
}

export default function ReportsView() {
  const [totals, setTotals] = useState<ReportTotals | null>(null);
  const [byClass, setByClass] = useState<ClassUsage[]>([]);
  const [mostBorrowed, setMostBorrowed] = useState<MostBorrowedBook[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/library-admin/reports");
      setTotals(res.data.data.totals);
      setByClass(res.data.data.byClass || []);
      setMostBorrowed(res.data.data.mostBorrowed || []);
    } catch {
      toast.error("Failed to load library reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const exportReport = (type: "catalog" | "overdue" | "fines") => {
    window.open(`${api.defaults.baseURL}/api/library-admin/reports/export?type=${type}`, "_blank");
    toast.success(`Exporting ${type} report CSV...`);
  };

  if (loading) return <PageLoader label="Loading library reports..." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Library Analytics & Reports</h1>
          <p style={{ color: "#64748b" }}>Circulation usage, overdue trends, fine revenue, and catalog stats.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => exportReport("catalog")} style={{ padding: "8px 14px", borderRadius: 6, background: "#0f172a", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
            📥 Export Catalog CSV
          </button>
          <button onClick={() => exportReport("overdue")} style={{ padding: "8px 14px", borderRadius: 6, background: "#ef4444", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
            📥 Export Overdue CSV
          </button>
          <button onClick={() => exportReport("fines")} style={{ padding: "8px 14px", borderRadius: 6, background: "#16a34a", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
            📥 Export Fines CSV
          </button>
        </div>
      </div>

      {totals && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
          <div style={{ background: "#ffffff", padding: 16, borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#64748b" }}>Total Circulation</div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0f172a", marginTop: 4 }}>{totals.issuances}</div>
          </div>
          <div style={{ background: "#ffffff", padding: 16, borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#64748b" }}>Active Loans</div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#2563eb", marginTop: 4 }}>{totals.active}</div>
          </div>
          <div style={{ background: "#ffffff", padding: 16, borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#64748b" }}>Overdue Books</div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#dc2626", marginTop: 4 }}>{totals.overdue}</div>
          </div>
          <div style={{ background: "#ffffff", padding: 16, borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#64748b" }}>Fines Collected</div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#16a34a", marginTop: 4 }}>₹{totals.fineCollected}</div>
          </div>
          <div style={{ background: "#ffffff", padding: 16, borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#64748b" }}>Fines Waived</div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#d97706", marginTop: 4 }}>₹{totals.fineWaived}</div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Most Borrowed Books */}
        <div style={{ background: "#ffffff", padding: 20, borderRadius: 10, border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: 12 }}>🔥 Top Borrowed Books</h2>
          {mostBorrowed.length === 0 ? (
            <p style={{ color: "#64748b" }}>No borrowing statistics yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {mostBorrowed.map((b, idx) => (
                <div key={b._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 6 }}>
                  <div>
                    <strong>#{idx + 1} {b.title}</strong>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{b.author}</div>
                  </div>
                  <span style={{ fontWeight: 700, color: "#2563eb", background: "#dbeafe", padding: "2px 8px", borderRadius: 4, fontSize: "0.85rem" }}>
                    {b.borrowCount} loans
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Class-wise Usage Breakdown */}
        <div style={{ background: "#ffffff", padding: 20, borderRadius: 10, border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: 12 }}>🎓 Class & Department Usage</h2>
          {byClass.length === 0 ? (
            <p style={{ color: "#64748b" }}>No class circulation data recorded.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {byClass.map((c) => (
                <div key={c.className} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 6 }}>
                  <div>
                    <strong>{c.className}</strong>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Active: {c.active} | Overdue: {c.overdue}</div>
                  </div>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{c.total} total loans</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
