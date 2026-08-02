import React from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Verify from "./pages/Verify";
import Dashboard from "./pages/Dashboard";
import StudentProfile from "./pages/StudentProfile";
import ClassOverview from "./pages/ClassOverview";
import NotificationsPage from "./pages/NotificationsPage";
import AdminDashboard from "./pages/AdminDashboard";
import { Toaster } from "react-hot-toast";

import CollegeAdminDashboard from "./pages/CollegeAdminDashboard";
import StudentAssignmentsPage from "./pages/StudentAssignmentsPage";
import StudentBadgesPage from "./pages/StudentBadgesPage";
import ReportCard from "./pages/ReportCard";
import axios from "axios";
import { ErrorState, LoadingState } from "./components/AsyncState";
import eduGuardLogo from "./assets/e.png";

const WorkspaceLoadingScreen = () => <main className="flex min-h-dvh items-center justify-center bg-[#f8f9fa] p-6 text-center" role="status" aria-live="polite">
  <div>
    <div className="workspace-loader mx-auto flex h-24 w-24 items-center justify-center rounded-[24px] border border-slate-200 bg-white shadow-lg"><img src={eduGuardLogo} alt="EduGuard" className="h-16 w-16 rounded-2xl object-cover" /></div>
    <p className="mt-5 text-sm font-black tracking-wide text-[#132238]">Workspace loading…</p>
    <p className="mt-1 text-xs text-slate-500">Preparing your EduGuard dashboard</p>
    <span className="mx-auto mt-4 block h-1.5 w-36 overflow-hidden rounded-full bg-slate-200"><span className="workspace-loader-bar block h-full w-1/2 rounded-full bg-[#3155C6]" /></span>
  </div>
</main>;

// Error Boundary to catch page crashes without losing the navbar/sidebar
class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("RouteErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#f8f9fa] p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg className="h-7 w-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Something went wrong</h2>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            An unexpected error occurred while loading this page.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = "/";
            }}
            className="mt-4 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const MentorApprovalStatus: React.FC = () => {
  const { user, logout } = useAuth();

  const isRejected = user?.status === "rejected" || user?.status === "disabled";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f8f9fa] p-4 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${isRejected ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
          {isRejected ? (
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <h1 className="text-xl font-semibold text-[#202124]">
          {isRejected ? "Account Not Active" : "Waiting for College Admin Approval"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#5f6368]">
          {isRejected
            ? "Your mentor account is not active. Please contact your college administration department."
            : "Your mentor registration has been submitted. You can access the instructor dashboard after your college admin approves your account."}
        </p>
        <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-left">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Signed in as</span>
          <span className="mt-1 block text-sm font-semibold text-slate-800">{user?.name}</span>
          <span className="block text-xs text-slate-500">{user?.email}</span>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
};

const LmsRedirect: React.FC = () => {
  const [error, setError] = React.useState("");
  const openLms = React.useCallback(() => {
    setError("");
    axios.post("/api/auth/lms-sso").then(({ data }) => {
      window.location.assign(`${data.lmsUrl.replace(/\/$/, "")}/#token=${encodeURIComponent(data.token)}`);
    }).catch((err) => setError(err.response?.data?.message || "Could not open the Library service"));
  }, []);
  React.useEffect(openLms, [openLms]);
  return error ? <ErrorState message={error} onRetry={openLms} /> : <LoadingState label="Opening EduGuard Library…" />;
};

// Bottom Navigation Bar for mobile devices
const BottomNav: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);

  const defaultClass = user?.assignedClasses?.length ? user.assignedClasses[0] : "BCA-A";

  const items = user?.role === "student"
    ? [
        {
          name: "Profile",
          path: "/",
          matchPath: "/",
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A8.966 8.966 0 0112 15c2.21 0 4.232.8 5.793 2.126M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
            </svg>
          ),
        },
        {
          name: "Assignments",
          path: "/assignments",
          matchPath: "/assignments",
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 00-2 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          ),
        },
      ]
    : user?.role === "college-admin"
    ? [
        {
          name: "Dashboard",
          path: "/",
          matchPath: "/",
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
            </svg>
          ),
        },
        {
          name: "Library",
          path: "/library",
          matchPath: "/library",
          icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5V5a2 2 0 012-2h14v14H6.5A2.5 2.5 0 004 19.5z" /></svg>,
        },
      ]
    : [
        {
          name: "Home",
          path: "/",
          matchPath: "/",
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
            </svg>
          ),
        },
        {
          name: "Classes",
          path: `/class/${defaultClass}`,
          matchPath: "/class",
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          ),
        },
        {
          name: "Alerts",
          path: "/notifications",
          matchPath: "/notifications",
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          ),
        },
      ];

  const isActive = (item: typeof items[0]) => {
    if (item.matchPath === "/") return location.pathname === "/";
    return location.pathname.startsWith(item.matchPath);
  };

  return (
    <nav className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[9999] flex h-[calc(72px+env(safe-area-inset-bottom))] items-center justify-around border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] md:hidden">
      {items.map((item) => (
        <NavLink
          key={item.name}
          to={item.path}
          className={() =>
            `flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-all ${
              isActive(item)
                ? "text-primary"
                : "text-slate-400 hover:text-text-primary"
            }`
          }
        >
          <div className={`p-1 rounded-lg transition-all ${isActive(item) ? "bg-primary/5" : ""}`}>
            {item.icon}
          </div>
          {item.name}
        </NavLink>
      ))}
      <div className="relative">
        {showProfileMenu && (
          <div className="absolute bottom-full right-0 mb-3 w-48 rounded-xl border border-slate-100 bg-white py-2 shadow-xl ring-1 ring-black/5">
            <div className="border-b border-slate-100 px-4 py-2">
              <p className="text-xs font-bold text-text-primary">{user?.name}</p>
              <p className="truncate text-[10px] text-slate-400">{user?.email}</p>
            </div>
            {user?.role === "student" && <button
              type="button"
              onClick={() => { setShowProfileMenu(false); navigate("/badge"); }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-primary hover:bg-slate-50"
            >
              <span aria-hidden="true">◆</span>
              My Badges
            </button>}
            <button
              type="button"
              onClick={() => {
                setShowProfileMenu(false);
                logout();
                navigate("/login");
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-critical hover:bg-slate-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowProfileMenu((show) => !show)}
          className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold text-slate-400 transition-all hover:text-text-primary"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">
            {user?.name.substring(0, 2).toUpperCase() || "ME"}
          </div>
          Profile
        </button>
      </div>
    </nav>
  );
};

const ProtectedLayout: React.FC = () => {
  const { token, loading, user } = useAuth();

  if (loading) {
    return <WorkspaceLoadingScreen />;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === "mentor" && user.status !== "approved") {
    return <MentorApprovalStatus />;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Navbar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <div className="mobile-route-space flex min-w-0 flex-1 overflow-hidden">
          <RouteErrorBoundary>
            <Routes>
              <Route path="/" element={user?.role === "librarian" ? <LmsRedirect /> : user?.role === "student" ? <StudentProfile /> : (user?.role === "college-admin" ? <CollegeAdminDashboard /> : (user?.role === "admin" ? <AdminDashboard /> : <Dashboard />))} />
              <Route path="/library" element={user?.role === "college-admin" || user?.role === "librarian" ? <LmsRedirect /> : <Navigate to="/" replace />} />
              <Route path="/students" element={user?.role === "student" ? <Navigate to="/" replace /> : (user?.role === "college-admin" ? <Navigate to="/" replace /> : (user?.role === "admin" ? <AdminDashboard /> : <Dashboard />))} />
              <Route path="/students/:id" element={<StudentProfile />} />
              <Route path="/class/:className" element={user?.role === "student" ? <Navigate to="/" replace /> : (user?.role === "admin" || user?.role === "college-admin" ? <Navigate to="/" replace /> : <ClassOverview />)} />
              <Route path="/notifications" element={user?.role === "student" ? <Navigate to="/" replace /> : (user?.role === "admin" || user?.role === "college-admin" ? <Navigate to="/" replace /> : <NotificationsPage />)} />
              <Route path="/assignments" element={user?.role === "student" ? <StudentAssignmentsPage /> : <Navigate to="/" replace />} />
              <Route path="/badge" element={user?.role === "librarian" ? <Navigate to="/" replace /> : <StudentBadgesPage />} />
              <Route path="/reportcard/:jobId" element={user?.role === "student" ? <ReportCard /> : <Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </RouteErrorBoundary>
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="*" element={<ProtectedLayout />} />
        </Routes>
        <Toaster
          position="top-right"
          containerStyle={{ zIndex: 99999 }}
          toastOptions={{
            style: { fontSize: '13px', maxWidth: '360px' },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
