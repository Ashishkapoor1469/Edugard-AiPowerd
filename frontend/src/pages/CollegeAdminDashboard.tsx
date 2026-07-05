import React, { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.js";

interface Mentor {
  _id: string;
  id?: string;
  name: string;
  email: string;
  status: string;
  department: string;
  batch?: string;
  semester?: number;
  maxStudents: number;
  assignedClasses?: string[];
  assignedCount?: number;
  studentCount?: number;
}

const CollegeAdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"mentors" | "announcements" | "syllabus">("mentors");

  // State
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [loading, setLoading] = useState(false);

  // Announcement Form State
  const [annTitle, setAnnTitle] = useState("");
  const [annDesc, setAnnDesc] = useState("");
  const [annTarget, setAnnTarget] = useState("all");
  const [annExpiry, setAnnExpiry] = useState("");

  // Event Form State
  const [evtName, setEvtName] = useState("");
  const [evtDesc, setEvtDesc] = useState("");
  const [evtDate, setEvtDate] = useState("");
  const [evtLocation, setEvtLocation] = useState("");
  const [evtLink, setEvtLink] = useState("");

  // Syllabus State
  const [syllabusCourse, setSyllabusCourse] = useState("BCA");
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false);
  const [showSyllabusHelp, setShowSyllabusHelp] = useState(false);

  const fetchMentors = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/admin/mentors");
      if (res.data.success) {
        setMentors(res.data.data || []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load mentors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "mentors") {
      fetchMentors();
    }
  }, [activeTab]);

  const handleUpdateStatus = async (id: string, status: "approved" | "rejected" | "disabled", successLabel?: string) => {
    try {
      const res = await axios.post(`/api/admin/mentors/${id}/status`, { status });
      if (res.data.success) {
        const label = successLabel || (status === "disabled" ? "blocked" : status);
        toast.success(`Mentor successfully ${label}!`);
        fetchMentors();
      }
    } catch (err) {
      toast.error("Action failed");
    }
  };

  const getStatusBadge = (status: string) => {
    const normalized = status?.toLowerCase();
    if (normalized === "approved") {
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    }
    if (normalized === "pending_verification") {
      return "bg-amber-50 text-amber-700 border-amber-100";
    }
    if (normalized === "disabled") {
      return "bg-slate-100 text-slate-700 border-slate-200";
    }
    return "bg-red-50 text-red-700 border-red-100";
  };

  const formatStatus = (status: string) => {
    if (status === "pending_verification") return "Pending";
    if (status === "disabled") return "Blocked";
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/api/college-admin/announcements", {
        title: annTitle,
        description: annDesc,
        targetAudience: annTarget,
        expiryDate: annExpiry ? new Date(annExpiry) : null,
      });
      if (res.data.success) {
        toast.success("Announcement successfully broadcasted to your college!");
        setAnnTitle("");
        setAnnDesc("");
        setAnnExpiry("");
      }
    } catch (err) {
      toast.error("Failed to post announcement");
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/api/college-admin/events", {
        eventName: evtName,
        description: evtDesc,
        date: new Date(evtDate),
        location: evtLocation,
        registrationLink: evtLink,
      });
      if (res.data.success) {
        toast.success("College event scheduled successfully!");
        setEvtName("");
        setEvtDesc("");
        setEvtDate("");
        setEvtLocation("");
        setEvtLink("");
      }
    } catch (err) {
      toast.error("Failed to schedule event");
    }
  };

  const handleSyllabusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syllabusFile) {
      toast.error("Please select an Excel file to upload");
      return;
    }

    const formData = new FormData();
    formData.append("file", syllabusFile);
    formData.append("course", syllabusCourse);

    setUploadingSyllabus(true);
    const toastId = toast.loading("Processing syllabus Excel structure...");

    try {
      const res = await axios.post("/api/college-admin/syllabus/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.success) {
        toast.success(`Syllabus for ${syllabusCourse} processed & saved successfully!`, { id: toastId });
        setSyllabusFile(null);
        // Clear file input
        const fileInput = document.getElementById("syllabus-file-input") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to process syllabus Excel";
      toast.error(msg, { id: toastId });
    } finally {
      setUploadingSyllabus(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-6 font-sans">
      {/* Header Banner */}
      <div className="mb-6 rounded-2xl bg-white border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">College Administration Workspace</h1>
          <p className="text-xs text-slate-500 mt-1">Verify new instructors, broadcast announcements, and upload academic syllabi.</p>
          {user?.collegeName && (
            <div className="flex items-center gap-2 mt-2">
              <svg className="h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className="text-sm font-semibold text-indigo-700">{user.collegeName}</span>
            </div>
          )}
        </div>
        <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 self-start md:self-auto uppercase tracking-wider">
          College Admin Dashboard
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6 border-b border-slate-200 flex gap-2 overflow-x-auto pb-px">
        {[
          { id: "mentors", label: "Mentor Management" },
          { id: "announcements", label: "Announcements & Events" },
          { id: "syllabus", label: "University Syllabus" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-xs font-bold border-b-2 rounded-t-lg transition-all ${
              activeTab === tab.id
                ? "border-primary text-primary bg-indigo-50/20"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="grid grid-cols-1 gap-6">
        {/* TAB 1: MENTOR MANAGEMENT */}
        {activeTab === "mentors" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Mentor Management</h2>
                <p className="text-[10px] text-slate-500 mt-1">Review registrations and control mentor access for your college.</p>
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border border-slate-100 rounded-lg px-3 py-1">
                {mentors.length} Mentors
              </span>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <svg className="h-6 w-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : mentors.length === 0 ? (
              <p className="text-xs text-slate-500 py-10 text-center italic border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                No mentors found for your college.
              </p>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Mentor Name</th>
                      <th className="px-4 py-3">Email Address</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3 text-center">Students</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {mentors.map((m) => (
                      <tr key={m._id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{m.name}</div>
                          <div className="text-[10px] text-slate-400">{m.assignedClasses?.length ? m.assignedClasses.join(", ") : m.batch || "No class assigned"}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{m.email}</td>
                        <td className="px-4 py-3 text-slate-500">{m.department || "N/A"}</td>
                        <td className="px-4 py-3 text-center text-slate-700">
                          {m.assignedCount ?? m.studentCount ?? 0}/{m.maxStudents || 50}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center justify-center min-w-20 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusBadge(m.status)}`}>
                            {formatStatus(m.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {m.status === "pending_verification" && (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(m._id, "approved", "approved")}
                                  className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-lg font-bold text-[10px] hover:bg-emerald-100 transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(m._id, "rejected", "rejected")}
                                  className="bg-red-50 text-red-700 border border-red-100 px-3 py-1 rounded-lg font-bold text-[10px] hover:bg-red-100 transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {m.status === "disabled" ? (
                              <button
                                onClick={() => handleUpdateStatus(m._id, "approved", "unblocked")}
                                className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-lg font-bold text-[10px] hover:bg-emerald-100 transition-colors"
                              >
                                Unblock
                              </button>
                            ) : m.status !== "pending_verification" && (
                              <button
                                onClick={() => handleUpdateStatus(m._id, "disabled", "blocked")}
                                className="bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1 rounded-lg font-bold text-[10px] hover:bg-slate-200 transition-colors"
                              >
                                Block
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ANNOUNCEMENTS & EVENTS */}
        {activeTab === "announcements" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Announcement Form */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <h2 className="text-sm font-bold text-slate-800 mb-1">Create College Announcement</h2>
              <p className="text-[10px] text-slate-500 mb-4">Send a broadcast notification visible to all mentors and students in your college.</p>
              
              <form onSubmit={handleCreateAnnouncement} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Broadcast Title</label>
                  <input
                    type="text"
                    required
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    placeholder="e.g. End Semester Exams Schedule Released"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Message Content</label>
                  <textarea
                    required
                    rows={4}
                    value={annDesc}
                    onChange={(e) => setAnnDesc(e.target.value)}
                    placeholder="Enter announcement details..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Target Audience</label>
                    <select
                      value={annTarget}
                      onChange={(e) => setAnnTarget(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden bg-white"
                    >
                      <option value="all">All Users</option>
                      <option value="mentor">Mentors Only</option>
                      <option value="student">Students Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Expiry Date (Optional)</label>
                    <input
                      type="date"
                      value={annExpiry}
                      onChange={(e) => setAnnExpiry(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-primary text-white py-2 rounded-lg text-xs font-bold hover:bg-primary-hover transition-colors mt-2"
                >
                  Publish Announcement
                </button>
              </form>
            </div>

            {/* Create Event Form */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <h2 className="text-sm font-bold text-slate-800 mb-1">Schedule College Event</h2>
              <p className="text-[10px] text-slate-500 mb-4">Post details of college hackathons, guest lectures, or academic conferences.</p>

              <form onSubmit={handleCreateEvent} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Event Name</label>
                  <input
                    type="text"
                    required
                    value={evtName}
                    onChange={(e) => setEvtName(e.target.value)}
                    placeholder="e.g. EduGuard Annual Hackathon 2026"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Description</label>
                  <textarea
                    required
                    rows={2}
                    value={evtDesc}
                    onChange={(e) => setEvtDesc(e.target.value)}
                    placeholder="Explain what the event is about..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date & Time</label>
                    <input
                      type="datetime-local"
                      required
                      value={evtDate}
                      onChange={(e) => setEvtDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Location / Hall</label>
                    <input
                      type="text"
                      required
                      value={evtLocation}
                      onChange={(e) => setEvtLocation(e.target.value)}
                      placeholder="e.g. Seminar Hall A"
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Registration Link (Optional)</label>
                  <input
                    type="url"
                    value={evtLink}
                    onChange={(e) => setEvtLink(e.target.value)}
                    placeholder="e.g. https://forms.gle/..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-primary text-white py-2 rounded-lg text-xs font-bold hover:bg-primary-hover transition-colors"
                >
                  Schedule Event
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: UNIVERSITY SYLLABUS */}
        {activeTab === "syllabus" && (
          <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-slate-800">Upload University Syllabus</h2>
              <button
                type="button"
                onClick={() => setShowSyllabusHelp(true)}
                className="shrink-0 h-7 w-7 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary hover:bg-indigo-50 transition-all"
                title="Excel format help"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-5">Upload an Excel sheet (.xlsx) containing course curriculum subjects, credits, and semesters.</p>

            {/* Syllabus Help Modal */}
            {showSyllabusHelp && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowSyllabusHelp(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">📋 Syllabus Excel Format Guide</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Required columns for the curriculum spreadsheet</p>
                    </div>
                    <button onClick={() => setShowSyllabusHelp(false)} className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="px-6 py-5 space-y-5">
                    {/* Columns */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 mb-2">Required Columns</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          {col: "Semester", desc: "Semester number (1-8)", alt: "sem"},
                          {col: "SubjectCode", desc: "Unique subject code", alt: "code, subcode"},
                          {col: "SubjectName", desc: "Name of the subject", alt: "subject, subname, name"},
                          {col: "Credits", desc: "Credit hours (e.g. 4)", alt: "credit"},
                          {col: "Description", desc: "Syllabus content/summary", alt: "syllabus, content"},
                        ].map(f => (
                          <div key={f.col} className="rounded-lg border border-indigo-100 bg-indigo-50/30 px-3 py-2">
                            <span className="text-[11px] font-bold text-indigo-700 block">{f.col}</span>
                            <span className="text-[9px] text-indigo-600/70">{f.desc}</span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">Aliases: {f.alt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Example Table */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 mb-2">📊 Example Excel Sheet</h4>
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-[9px]">
                          <thead>
                            <tr className="bg-slate-50">
                              {["Semester","SubjectCode","SubjectName","Credits","Description"].map(h => (
                                <th key={h} className="px-2.5 py-2 font-bold text-slate-600 text-left border-b border-slate-200 whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-slate-100">
                              <td className="px-2.5 py-1.5 text-slate-700">1</td>
                              <td className="px-2.5 py-1.5 text-slate-700">BCA101</td>
                              <td className="px-2.5 py-1.5 text-slate-700">Programming in C</td>
                              <td className="px-2.5 py-1.5 text-slate-700">4</td>
                              <td className="px-2.5 py-1.5 text-slate-500">Variables, loops, arrays...</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                              <td className="px-2.5 py-1.5 text-slate-700">1</td>
                              <td className="px-2.5 py-1.5 text-slate-700">BCA102</td>
                              <td className="px-2.5 py-1.5 text-slate-700">Mathematics I</td>
                              <td className="px-2.5 py-1.5 text-slate-700">3</td>
                              <td className="px-2.5 py-1.5 text-slate-500">Calculus, matrices, stats...</td>
                            </tr>
                            <tr>
                              <td className="px-2.5 py-1.5 text-slate-700">2</td>
                              <td className="px-2.5 py-1.5 text-slate-700">BCA201</td>
                              <td className="px-2.5 py-1.5 text-slate-700">Data Structures</td>
                              <td className="px-2.5 py-1.5 text-slate-700">4</td>
                              <td className="px-2.5 py-1.5 text-slate-500">Stacks, queues, trees...</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 px-6 py-3 flex justify-end">
                    <button onClick={() => setShowSyllabusHelp(false)} className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-hover transition-colors">Got it</button>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSyllabusSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Degree Course</label>
                <select
                  value={syllabusCourse}
                  onChange={(e) => setSyllabusCourse(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-hidden bg-white font-medium"
                >
                  <option value="BCA">BCA (Bachelor of Computer Applications)</option>
                  <option value="BBA">BBA (Bachelor of Business Administration)</option>
                  <option value="BTECH">B.Tech (Bachelor of Technology)</option>
                  <option value="BSC">B.Sc (Bachelor of Science)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Curriculum Excel File (.xlsx)</label>
                <div className="mt-1 border-2 border-dashed border-slate-200 hover:border-primary rounded-xl p-6 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-white cursor-pointer transition-all relative">
                  <input
                    id="syllabus-file-input"
                    type="file"
                    required
                    accept=".xlsx"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setSyllabusFile(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <svg className="h-8 w-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs font-semibold text-slate-700">
                    {syllabusFile ? syllabusFile.name : "Click or drag spreadsheet here"}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">Excel formats only (.xlsx)</span>
                </div>
              </div>

              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-[10px] text-indigo-700 leading-normal">
                <span className="font-bold uppercase tracking-wider block mb-1">Expected Excel Headers:</span>
                Your spreadsheet columns must include: <strong>Semester</strong>, <strong>SubjectCode</strong>, <strong>SubjectName</strong>, <strong>Credits</strong>, and <strong>Description</strong>.
              </div>

              <button
                type="submit"
                disabled={uploadingSyllabus}
                className="w-full bg-primary text-white py-2 rounded-lg text-xs font-bold hover:bg-primary-hover disabled:bg-slate-300 transition-colors"
              >
                {uploadingSyllabus ? "Uploading Curriculum..." : "Upload & Save Syllabus"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default CollegeAdminDashboard;
