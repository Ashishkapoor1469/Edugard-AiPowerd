import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";

interface Notification {
  _id: string;
  type: "high_risk" | "attendance_drop" | "marks_drop" | "behavior_change" | "critical_alert";
  message: string;
  isRead: boolean;
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
  studentId: {
    _id: string;
    name: string;
    rollNo: string;
    class: string;
  };
}

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  // College broadcasts state
  const [collegeAlerts, setCollegeAlerts] = useState<any[]>([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const fetchNotifications = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: any = {};
      if (activeTab === "unread") params.isRead = "false";
      if (activeTab === "high_risk") params.type = "high_risk";
      if (activeTab === "attendance") params.type = "attendance_drop";
      if (activeTab === "marks") params.type = "marks_drop";
      if (activeTab === "behavior") params.type = "behavior_change";

      const res = await axios.get("/api/notifications", { params, signal });
      if (res.data.success) {
        setNotifications(res.data.data);
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      console.error(err);
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  const fetchCollegeAlerts = async (signal?: AbortSignal) => {
    const CACHE_KEY = "eduguard_mentor_broadcasts";
    const TTL = 5 * 60 * 1000;

    // Show cached data instantly (stale-while-revalidate)
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { data, ts } = JSON.parse(cached);
        setCollegeAlerts(data);
        if (Date.now() - ts < TTL) {
          setLoadingBroadcasts(false);
          return; // Cache still fresh, skip network
        }
      } catch {
        sessionStorage.removeItem(CACHE_KEY);
      }
    }

    setLoadingBroadcasts(true);
    try {
      const res = await axios.get("/api/mentors/my-alerts", { signal });
      if (res.data.success) {
        setCollegeAlerts(res.data.data);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: res.data.data, ts: Date.now() }));
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      console.error(err);
    } finally {
      setLoadingBroadcasts(false);
    }
  };

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (activeTab === "broadcasts") {
      fetchCollegeAlerts(controller.signal);
    } else {
      fetchNotifications(controller.signal);
    }

    return () => controller.abort();
  }, [activeTab]);

  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await axios.patch(`/api/notifications/${id}/read`);
      if (res.data.success) {
        toast.success("Notification read");
        setNotifications((prev) =>
          prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await axios.patch("/api/notifications/read-all");
      if (res.data.success) {
        toast.success("All marked as read");
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await axios.delete(`/api/notifications/${id}`);
      if (res.data.success) {
        toast.success("Notification deleted");
        setNotifications((prev) => prev.filter((n) => n._id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Color mappings based on priority/level
  const getPriorityBorderColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "border-l-critical";
      case "high": return "border-l-high";
      case "medium": return "border-l-medium";
      case "low": return "border-l-primary";
      default: return "border-l-slate-200";
    }
  };

  const getPriorityBadgeColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-50 text-critical border-red-200";
      case "high": return "bg-orange-50 text-high border-orange-200";
      case "medium": return "bg-amber-50 text-medium border-amber-200";
      case "low": return "bg-primary/5 text-primary border-primary/20";
      default: return "bg-slate-50 text-secondary border-slate-200";
    }
  };

  const tabs = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
    { id: "high_risk", label: "High Risk Alerts" },
    { id: "attendance", label: "Attendance Drops" },
    { id: "marks", label: "Marks Drops" },
    { id: "behavior", label: "Behavior Changes" },
    { id: "broadcasts", label: "College Broadcasts" },
  ];

  return (
    <div className="main-content flex-1 overflow-y-auto bg-bg-base p-6">
      {/* Page Header */}
      <div className="mb-6 flex flex-col justify-between sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Notifications</h1>
          <p className="text-xs text-secondary font-medium">Real-time alerts and risk updates</p>
        </div>

        {notifications.some(n => !n.isRead) && (
          <button
            onClick={handleMarkAllRead}
            className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-secondary hover:bg-slate-50 shadow-xs transition-all sm:mt-0"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Tabs Filter */}
      <div className="mb-6 border-b border-slate-200">
        <div className="flex flex-wrap gap-2 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-4 py-2 text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-secondary hover:border-slate-300 hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications List */}
      {activeTab === "broadcasts" ? (
        <div className="flex flex-col gap-4">
          {loadingBroadcasts ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-20 w-full animate-pulse rounded-xl bg-slate-200" />
            ))
          ) : collegeAlerts.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">
              No college broadcasts found. Your college admin hasn't posted any announcements or events yet.
            </div>
          ) : (
            collegeAlerts.map((n) => (
              <div key={n._id} className={`rounded-xl border p-5 shadow-xs flex gap-4 ${n.type === "event" ? "bg-purple-50/50 border-purple-100" : "bg-primary/5 border-primary/15"}`}>
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${n.type === "event" ? "bg-purple-100" : "bg-primary/10"}`}>
                  {n.type === "event" ? (
                    <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  ) : (
                    <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${n.type === "event" ? "bg-purple-200 text-purple-800" : "bg-primary/15 text-primary"}`}>
                      {n.type === "event" ? "Event" : "Announcement"}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {new Date(n.createdAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {n.title && <p className="text-sm font-bold text-slate-800">{n.title}</p>}
                  <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                  {n.type === "event" && n.location && (
                    <span className="text-[10px] text-purple-700 mt-1.5 block font-medium">📍 {n.location}{n.date ? ` · ${new Date(n.date).toLocaleDateString()}` : ""}</span>
                  )}
                  {n.type === "event" && n.registrationLink && (
                    <a href={n.registrationLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary font-semibold hover:underline mt-1 inline-block">Register →</a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
      <div className="flex flex-col gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-24 w-full animate-pulse rounded-xl bg-slate-200" />
          ))
        ) : notifications.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">
            No notifications found.
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif._id}
              className={`rounded-xl border border-slate-200 bg-white p-5 shadow-xs border-l-4 transition-all flex flex-col gap-3 justify-between sm:flex-row sm:items-center ${
                getPriorityBorderColor(notif.priority)
              } ${!notif.isRead ? "bg-primary/5 ring-1 ring-primary/5" : ""}`}
            >
              {/* Message Content */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Priority Badge */}
                  <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    getPriorityBadgeColor(notif.priority)
                  }`}>
                    {notif.priority}
                  </span>
                  
                  {/* Type Badge */}
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-secondary uppercase tracking-wider">
                    {notif.type.replace("_", " ")}
                  </span>

                  <span className="text-[10px] text-slate-400 font-bold">
                    {new Date(notif.createdAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <p className="text-xs font-semibold text-text-primary leading-relaxed mt-1">
                  {notif.message}
                </p>

                <span className="text-[10px] font-bold text-slate-400">
                  Student: {notif.studentId?.name || "Unknown"} (Roll No: #{notif.studentId?.rollNo || "N/A"}) · Class: {notif.studentId?.class || "N/A"}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => navigate(`/students/${notif.studentId._id || notif.studentId}`)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-hover shadow-xs focus:outline-hidden"
                >
                  View Profile
                </button>

                {!notif.isRead && (
                  <button
                    onClick={() => handleMarkAsRead(notif._id)}
                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary transition-all focus:outline-hidden"
                    title="Mark as read"
                  >
                    <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                )}

                <button
                  onClick={() => handleDelete(notif._id)}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-all focus:outline-hidden"
                  title="Delete notification"
                >
                  <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-16v1a3 3 0 003 3h10a3 3 0 003-3v-1M7 7h10" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      )}
    </div>
  );
};

export default NotificationsPage;
