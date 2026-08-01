import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { api } from "./api";
import Layout from "./components/Layout";
import LibrarianDashboard from "./pages/LibrarianDashboard";
import Catalog from "./pages/Catalog";
import CollegeAdminLibrary from "./pages/CollegeAdminLibrary";
import type { User } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState({ email: "", password: "" }); const [loginError, setLoginError] = useState("");
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1)); const incoming = fragment.get("token");
    const bootstrap = async () => {
      if (incoming) { const exchanged = await api.post("/api/auth/exchange", { token: incoming }); sessionStorage.setItem("lmsToken", exchanged.data.token); history.replaceState(null, "", window.location.pathname); }
      const response = await api.get("/api/auth/me"); setUser(response.data.data);
    };
    bootstrap().catch(() => sessionStorage.removeItem("lmsToken")).finally(() => setLoading(false));
  }, []);
  const librarianLogin = async (event: React.FormEvent) => {
    event.preventDefault(); setLoginError("");
    try { const result = await api.post("/api/auth/librarian-login", login); sessionStorage.setItem("lmsToken", result.data.token); const me = await api.get("/api/auth/me"); setUser(me.data.data); }
    catch (error: any) { setLoginError(error.response?.data?.message || "Invalid librarian email or password."); }
  };
  if (loading) return <div className="center-card">Opening EduGuard Library...</div>;
  if (!user) return <div className="center-card"><h1>EduGuard Library</h1><p>College administrators open Library from EduGuard. Librarians can sign in directly with the account created by their college administrator.</p><form className="form-stack login-form" onSubmit={librarianLogin}><label>Email<input type="email" required autoComplete="username" value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} /></label><label>Password<input type="password" required autoComplete="current-password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} /></label>{loginError && <p className="form-error">{loginError}</p>}<button>Sign in as librarian</button></form><a className="return-link" href={import.meta.env.VITE_EDUGUARD_URL || "https://edugard-ai-powerd.vercel.app"}>Return to EduGuard</a></div>;
  const home = user.role === "librarian" ? "/dashboard" : "/admin";
  return <Layout user={user}><Routes>
    <Route path="/" element={<Navigate to={home} replace />} />
    <Route path="/catalog" element={<Catalog />} />
    <Route path="/dashboard" element={user.role === "librarian" ? <LibrarianDashboard user={user} /> : <Navigate to={home} />} />
    <Route path="/admin" element={user.role === "college-admin" ? <CollegeAdminLibrary user={user} /> : <Navigate to={home} />} />
    <Route path="*" element={<Navigate to={home} />} />
  </Routes><Toaster position="top-right" /></Layout>;
}
