import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import axios from "axios";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth, type User } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import Login from "./pages/Login";
import Verify from "./pages/Verify";
import Dashboard from "./pages/Dashboard";
import StudentProfile from "./pages/StudentProfile";
import ClassOverview from "./pages/ClassOverview";
import NotificationsPage from "./pages/NotificationsPage";
import AdminDashboard from "./pages/AdminDashboard";
import CollegeAdminDashboard from "./pages/CollegeAdminDashboard";
import StudentAssignmentsPage from "./pages/StudentAssignmentsPage";
import StudentBadgesPage from "./pages/StudentBadgesPage";
import ReportCard from "./pages/ReportCard";
import { ErrorState, LoadingState } from "./components/AsyncState";
import eduGuardLogo from "./assets/e.png";

const WorkspaceLoadingScreen = () => <main className="flex min-h-dvh items-center justify-center bg-[#f8f9fa] p-6 text-center" role="status" aria-live="polite"><div><div className="workspace-loader mx-auto flex h-24 w-24 items-center justify-center rounded-[24px] border border-slate-200 bg-white shadow-lg"><img src={eduGuardLogo} alt="EduGuard" className="h-16 w-16 rounded-2xl object-cover" /></div><p className="mt-5 text-sm font-black tracking-wide text-[#132238]">Workspace loading…</p><p className="mt-1 text-xs text-slate-500">Preparing your EduGuard dashboard</p><span className="mx-auto mt-4 block h-1.5 w-36 overflow-hidden rounded-full bg-slate-200"><span className="workspace-loader-bar block h-full w-1/2 rounded-full bg-[#3155C6]" /></span></div></main>;

class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error("RouteErrorBoundary caught:", error, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return <div className="flex flex-1 flex-col items-center justify-center bg-[#f8f9fa] p-6 text-center"><h2 className="text-lg font-semibold text-slate-800">Something went wrong</h2><p className="mt-1 max-w-sm text-xs text-slate-500">An unexpected error occurred while loading this page.</p><button type="button" onClick={() => { this.setState({ hasError: false }); window.location.assign("/"); }} className="mt-4 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white">Go to Dashboard</button></div>;
  }
}

const MentorApprovalStatus = () => {
  const { user, logout } = useAuth();
  const inactive = user?.status === "rejected" || user?.status === "disabled";
  return <main className="flex min-h-dvh items-center justify-center bg-[#f8f9fa] p-4"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"><h1 className="text-xl font-semibold text-[#202124]">{inactive ? "Account Not Active" : "Waiting for College Admin Approval"}</h1><p className="mt-2 text-sm leading-6 text-[#5f6368]">{inactive ? "Your mentor account is not active. Please contact your college administration department." : "Your mentor registration has been submitted. You can access the instructor dashboard after approval."}</p><button type="button" onClick={logout} className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white">Sign Out</button></section></main>;
};

const LmsRedirect = () => {
  const [error, setError] = React.useState("");
  const [targetUrl, setTargetUrl] = React.useState("");
  const openLms = React.useCallback(async () => {
    setError("");
    try {
      const { data } = await axios.post("/api/auth/lms-sso");
      const url = `${data.lmsUrl.replace(/\/$/, "")}/#token=${encodeURIComponent(data.token)}`;
      setTargetUrl(url);
      window.location.assign(url);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not open the Library service. Please try again.");
    }
  }, []);
  React.useEffect(() => { void openLms(); }, [openLms]);
  if (error) return <ErrorState message={error} onRetry={openLms} />;
  return <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-[#f8f9fa] p-8 text-center"><LoadingState label="Opening EduGuard Library…" />{targetUrl && <a href={targetUrl} className="mt-6 rounded-lg bg-[#12274E] px-5 py-2.5 text-xs font-bold text-white">Click here if EduGuard Library does not open automatically</a>}</main>;
};

const allowed = (role: User["role"] | undefined, roles: User["role"][], element: React.ReactNode) => roles.includes(role as User["role"]) ? element : <Navigate to="/" replace />;

const StudentProfileRoute = () => {
  const { user } = useAuth();
  const { id } = useParams();
  if (user?.role === "student" && id !== user.id) return <Navigate to="/" replace />;
  return allowed(user?.role, ["student", "mentor", "college-admin", "admin"], <StudentProfile />);
};

const ProtectedLayout = () => {
  const { token, loading, user } = useAuth();
  if (loading) return <WorkspaceLoadingScreen />;
  if (!token || !user) return <Navigate to="/login" replace />;
  if (user.role === "mentor" && user.status !== "approved") return <MentorApprovalStatus />;
  if (user.role === "librarian") return <LmsRedirect />;

  const home = user.role === "student" ? <StudentProfile /> : user.role === "college-admin" ? <CollegeAdminDashboard /> : user.role === "admin" ? <AdminDashboard /> : <Dashboard />;
  return <div className="flex h-dvh flex-col overflow-hidden"><Navbar /><div className="flex min-h-0 flex-1 overflow-hidden"><Sidebar /><div className="mobile-route-space flex min-w-0 flex-1 overflow-hidden"><RouteErrorBoundary><Routes>
    <Route path="/" element={home} />
    <Route path="/library" element={allowed(user.role, ["college-admin"], <LmsRedirect />)} />
    <Route path="/students" element={allowed(user.role, ["mentor"], <Dashboard />)} />
    <Route path="/students/:id" element={<StudentProfileRoute />} />
    <Route path="/class/:className" element={allowed(user.role, ["mentor"], <ClassOverview />)} />
    <Route path="/notifications" element={allowed(user.role, ["mentor"], <NotificationsPage />)} />
    <Route path="/assignments" element={allowed(user.role, ["student"], <StudentAssignmentsPage />)} />
    <Route path="/badge" element={allowed(user.role, ["student", "mentor", "college-admin", "admin"], <StudentBadgesPage />)} />
    <Route path="/reportcard/:jobId" element={allowed(user.role, ["student"], <ReportCard />)} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></RouteErrorBoundary></div></div><BottomNav /></div>;
};

export default function App() {
  return <AuthProvider><BrowserRouter><Routes><Route path="/login" element={<Login />} /><Route path="/verify" element={<Verify />} /><Route path="*" element={<ProtectedLayout />} /></Routes><Toaster position="top-right" containerStyle={{ zIndex: 99999 }} toastOptions={{ style: { fontSize: "13px", maxWidth: "360px" } }} /></BrowserRouter></AuthProvider>;
}
