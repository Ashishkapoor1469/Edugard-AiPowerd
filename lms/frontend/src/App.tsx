import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { api } from "./api";
import Layout from "./components/Layout";
import LibrarianDashboard from "./pages/LibrarianDashboard";
import StudentCatalog from "./pages/StudentCatalog";
import MyLibrary from "./pages/MyLibrary";
import CollegeAdminLibrary from "./pages/CollegeAdminLibrary";
import type { User } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1)); const incoming = fragment.get("token");
    const bootstrap = async () => {
      if (incoming) { const exchanged = await api.post("/api/auth/exchange", { token: incoming }); sessionStorage.setItem("lmsToken", exchanged.data.token); history.replaceState(null, "", window.location.pathname); }
      const response = await api.get("/api/auth/me"); setUser(response.data.data);
    };
    bootstrap().catch(() => sessionStorage.removeItem("lmsToken")).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="center-card">Opening EduGuard Library…</div>;
  if (!user) return <div className="center-card"><h1>EduGuard Library</h1><p>Open the Library from your authenticated EduGuard account. No separate LMS login is used.</p><a className="primary" href={import.meta.env.VITE_EDUGUARD_URL || "http://localhost:5173"}>Return to EduGuard</a></div>;
  const home = user.role === "librarian" ? "/dashboard" : user.role === "college-admin" || user.role === "admin" ? "/admin" : "/catalog";
  return <Layout user={user}><Routes>
    <Route path="/" element={<Navigate to={home} replace />} />
    <Route path="/catalog" element={<StudentCatalog user={user} />} />
    <Route path="/my-library" element={<MyLibrary user={user} />} />
    <Route path="/dashboard" element={user.role === "librarian" ? <LibrarianDashboard user={user} /> : <Navigate to={home} />} />
    <Route path="/admin" element={user.role === "college-admin" || user.role === "admin" ? <CollegeAdminLibrary user={user} /> : <Navigate to={home} />} />
    <Route path="*" element={<Navigate to={home} />} />
  </Routes><Toaster position="top-right" /></Layout>;
}
