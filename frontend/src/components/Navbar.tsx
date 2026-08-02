import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext.js";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import socket from "../utils/socket.js";
import toast from "react-hot-toast";
import eduGuardBrand from "../assets/e-witheduguardtext.png";
import { listLoadError } from "../utils/apiErrors.js";
import { LoadingState } from "./AsyncState.js";

interface SearchStudent {
  _id: string;
  name: string;
  rollNo: string;
  class: string;
  riskLevel: string;
}

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Search & Filters state
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const selectedCourse = searchParams.get("course") || "";
  const selectedClass = searchParams.get("class") || "";

  // Live search results
  const [searchResults, setSearchResults] = useState<SearchStudent[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Notifications state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Debounced live search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (search.trim().length < 2) {
      setSearchResults([]);
      setSearchError("");
      setShowSearchDropdown(false);
      return;
    }

    setSearchLoading(true);
    setSearchError("");
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await axios.get("/api/students", {
          params: { search: search.trim(), limit: 6 },
        });
        if (res.data.success) {
          setSearchResults(res.data.data);
          setShowSearchDropdown(true);
        }
      } catch (err: unknown) {
        console.error("Search failed:", err);
        setSearchError(listLoadError(err, "Student search failed. Please try again."));
        setShowSearchDropdown(true);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // Fetch notifications
  const fetchNotifications = async () => {
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      const res = await axios.get("/api/notifications");
      if (res.data.success) {
        setNotifications(res.data.data);
        setUnreadCount(res.data.data.filter((n: any) => !n.isRead).length);
      }
    } catch (err: unknown) {
      console.error("Failed to fetch notifications:", err);
      setNotificationsError(listLoadError(err, "Failed to load notifications."));
    } finally { setNotificationsLoading(false); }
  };

  useEffect(() => {
    // Skip notifications for roles that don't have access to the notification API
    if (user?.role === "admin" || user?.role === "college-admin") return;

    fetchNotifications();

    if (user) {
      socket.connect();
      socket.emit("mentor:online", user.id);

      socket.on("notification", (newNotif: any) => {
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadCount((c) => c + 1);
        toast((t) => (
          <div
            className="flex flex-col gap-1 cursor-pointer"
            onClick={() => {
              toast.dismiss(t.id);
              handleNotificationClick(newNotif);
            }}
          >
            <span className="font-bold text-sm text-primary">New Alert</span>
            <span className="text-xs text-text-primary">{newNotif.message}</span>
          </div>
        ), {
          icon: "🔔",
          duration: 5000,
        });
      });
    }

    return () => {
      socket.off("notification");
      socket.disconnect();
    };
  }, [user]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowBellDropdown(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileDropdown(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Update filters in URL
  const handleFilterChange = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSearchDropdown(false);
    const newParams = new URLSearchParams(searchParams);
    if (search.trim()) {
      newParams.set("search", search.trim());
    } else {
      newParams.delete("search");
    }
    setSearchParams(newParams);
  };

  const handleSearchResultClick = (studentId: string) => {
    setShowSearchDropdown(false);
    setSearch("");
    navigate(`/students/${studentId}`);
  };

  const handleNotificationClick = async (notif: any) => {
    setShowBellDropdown(false);
    try {
      if (!notif.isRead) {
        await axios.patch(`/api/notifications/${notif._id}/read`);
        fetchNotifications();
      }
      navigate(`/students/${notif.studentId._id || notif.studentId}`);
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    setMarkingAll(true);
    try {
      await axios.patch("/api/notifications/read-all");
      await fetchNotifications();
      setShowBellDropdown(false);
      toast.success("All marked as read");
    } catch (err) {
      console.error(err);
    } finally { setMarkingAll(false); }
  };

  const riskBadgeClass = (level: string) => {
    switch (level) {
      case "low": return "bg-emerald-50 text-low";
      case "medium": return "bg-amber-50 text-medium";
      case "high": return "bg-orange-50 text-high";
      case "critical": return "bg-red-50 text-critical";
      default: return "bg-slate-50 text-secondary";
    }
  };

  const courseOptions = ["BCA", "BBA", "BTECH", "BSC"];
  const classOptions = ["BCA-A", "BCA-B", "BBA-A", "BBA-B", "BTECH-A", "BTECH-B"];

  return (
    <header className="sticky top-0 z-40 hidden h-14 w-full items-center justify-between border-b border-slate-200 bg-white px-4 shadow-xs md:flex md:h-16 md:px-6">
    
      <div className="h-10 w-44 shrink-0 cursor-pointer overflow-hidden" onClick={() => navigate("/")}>
        <img src={eduGuardBrand} alt="EduGuard" className="h-full w-full object-cover" />
      </div>

      {/* Global Search Bar - hidden on mobile and for students */}
      {user?.role !== "student" && (
        <div ref={searchRef} className="hidden md:flex flex-1 max-w-md mx-8 relative">
          <form onSubmit={handleSearchSubmit} className="w-full relative">
            <input
              type="text"
              placeholder="Search students by name or roll number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-text-primary focus:border-primary focus:bg-white focus:outline-hidden transition-colors"
            />
            <button type="submit" className="absolute left-3 top-2.5 text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>

          {/* Search Results Dropdown */}
          {showSearchDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 z-50 overflow-hidden">
              {searchLoading ? (
                <div className="flex items-center justify-center py-6">
                  <svg className="h-5 w-5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : searchError ? (
                <div role="alert" className="px-4 py-6 text-center text-xs text-amber-700">{searchError}</div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">No students found for "{search}"</div>
              ) : (
                <>
                  <div className="px-3 py-2 border-b border-slate-100">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Search Results</span>
                  </div>
                  {searchResults.map((student) => (
                    <div
                      key={student._id}
                      onClick={() => handleSearchResultClick(student._id)}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-primary/5 cursor-pointer transition-colors border-b border-slate-50 last:border-b-0"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-primary">
                        {student.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-semibold text-text-primary truncate">{student.name}</span>
                        <span className="text-[10px] text-secondary">#{student.rollNo} · {student.class}</span>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${riskBadgeClass(student.riskLevel)}`}>
                        {student.riskLevel}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters, Bell & Avatar */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Course Filter - hidden on mobile and for students */}
        {user?.role !== "student" && (
          <select
            value={selectedCourse}
            onChange={(e) => handleFilterChange("course", e.target.value)}
            className="hidden md:block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-secondary focus:border-primary focus:outline-hidden"
          >
            <option value="">All Courses</option>
            {courseOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {/* Class Filter - hidden on mobile and for students */}
        {user?.role !== "student" && (
          <select
            value={selectedClass}
            onChange={(e) => handleFilterChange("class", e.target.value)}
            className="hidden md:block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-secondary focus:border-primary focus:outline-hidden"
          >
            <option value="">All Classes</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {/* Notification Bell */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setShowBellDropdown(!showBellDropdown)}
            className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-text-primary focus:outline-hidden"
          >
            <svg className="h-5 w-5 md:h-6 md:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 w-4 md:h-5 md:w-5 items-center justify-center rounded-full bg-critical text-[9px] md:text-[10px] font-bold text-white ring-2 ring-white">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Bell Dropdown */}
          {showBellDropdown && (
            <div className="absolute right-0 mt-2 w-72 md:w-80 rounded-xl border border-slate-100 bg-white py-2 shadow-xl ring-1 ring-black/5 z-50">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <span className="text-xs font-bold text-text-primary">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    disabled={markingAll}
                    className="text-[11px] font-semibold text-primary hover:underline"
                  >
                    {markingAll ? "Marking…" : "Mark all read"}
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notificationsLoading ? (
                  <LoadingState label="Loading notifications…" compact />
                ) : notificationsError ? (
                  <div role="alert" className="px-4 py-6 text-center text-xs text-amber-700">{notificationsError}</div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">No alerts found</div>
                ) : (
                  notifications.slice(0, 5).map((n) => (
                    <div
                      key={n._id}
                      onClick={() => handleNotificationClick(n)}
                      className={`flex cursor-pointer gap-2 border-b border-slate-50 px-4 py-3 hover:bg-slate-50 ${!n.isRead ? "bg-primary/5" : ""}`}
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.priority === "urgent" ? "bg-critical" : n.priority === "high" ? "bg-high" : "bg-medium"}`} />
                      <div className="flex flex-col">
                        <span className="text-xs text-text-primary font-medium">{n.message}</span>
                        <span className="text-[10px] text-slate-400 mt-1">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-slate-100 px-4 pt-2 text-center">
                <button
                  onClick={() => {
                    setShowBellDropdown(false);
                    navigate("/notifications");
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mentor Avatar */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="flex items-center gap-2 focus:outline-hidden"
          >
            <div className="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full bg-primary text-xs md:text-sm font-semibold text-white">
              {user?.name.substring(0, 2).toUpperCase() || "ME"}
            </div>
            <div className="hidden text-left md:block">
              <p className="text-xs font-bold leading-3 text-text-primary">{user?.name}</p>
              <span className="text-[10px] font-medium text-slate-400 capitalize">{user?.role}</span>
            </div>
            <svg className="hidden md:block h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Profile Dropdown */}
          {showProfileDropdown && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-100 bg-white py-2 shadow-xl ring-1 ring-black/5 z-50">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-text-primary">{user?.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
              </div>
              {user?.role === "student" && (
                <button
                  onClick={() => { setShowProfileDropdown(false); navigate("/badge"); }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-primary hover:bg-slate-50"
                >
                  <span aria-hidden="true">◆</span>
                  My Badges
                </button>
              )}
              {user?.role === "college-admin" && <button
                onClick={() => { setShowProfileDropdown(false); navigate("/library"); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-primary hover:bg-slate-50"
              >
                <span aria-hidden="true">▤</span>
                Library LMS
              </button>}
              <button
                onClick={() => {
                  setShowProfileDropdown(false);
                  logout();
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
        </div>
      </div>
    </header>
  );
};

export default Navbar;
