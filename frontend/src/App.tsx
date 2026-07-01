import React from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
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

// Bottom Navigation Bar for mobile devices
const BottomNav: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (user?.role === "student") return null;

  if (user?.role === "admin") {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden items-center justify-around border-t border-slate-200 bg-white/95 backdrop-blur-md px-2 py-1.5 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <NavLink
          to="/"
          className={() => "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold text-primary"}
        >
          <div className="p-1 rounded-lg bg-indigo-50">
            <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            </svg>
          </div>
          Workspace Admin
        </NavLink>
      </nav>
    );
  }

  const defaultClass = user?.assignedClasses?.length ? user.assignedClasses[0] : "BCA-A";

  const items = [
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
      name: "Students",
      path: "/students",
      matchPath: "/students",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden items-center justify-around border-t border-slate-200 bg-white/95 backdrop-blur-md px-2 py-1.5 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
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
          <div className={`p-1 rounded-lg transition-all ${isActive(item) ? "bg-indigo-50" : ""}`}>
            {item.icon}
          </div>
          {item.name}
        </NavLink>
      ))}
    </nav>
  );
};

const ProtectedLayout: React.FC = () => {
  const { token, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#f8f9fa] animate-pulse-slow">
        <svg className="h-16 w-16 text-[#1a73e8] animate-pulse" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3z" />
          <path d="M21 12.09c-.28-.05-.56-.09-.84-.13C19.26 12 18 13.5 18 15v2.24l-6 3.27-6-3.27V12h-2v6l8 4.36 8-4.36v-3.55c0-1.04-.57-1.92-1-2.36z" />
        </svg>
        <h2 className="mt-4 text-xl font-medium text-[#202124] tracking-tight">EduGuard</h2>
        <p className="mt-1 text-xs text-[#5f6368] font-medium tracking-wide">Workspace loading...</p>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 overflow-hidden pb-14 md:pb-0">
          <Routes>
            <Route path="/" element={user?.role === "student" ? <StudentProfile /> : (user?.role === "admin" ? <AdminDashboard /> : <Dashboard />)} />
            <Route path="/students" element={user?.role === "student" ? <Navigate to="/" replace /> : (user?.role === "admin" ? <AdminDashboard /> : <Dashboard />)} />
            <Route path="/students/:id" element={<StudentProfile />} />
            <Route path="/class/:className" element={user?.role === "student" ? <Navigate to="/" replace /> : (user?.role === "admin" ? <Navigate to="/" replace /> : <ClassOverview />)} />
            <Route path="/notifications" element={user?.role === "student" ? <Navigate to="/" replace /> : (user?.role === "admin" ? <Navigate to="/" replace /> : <NotificationsPage />)} />
            <Route path="/admin" element={user?.role === "admin" ? <AdminDashboard /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
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