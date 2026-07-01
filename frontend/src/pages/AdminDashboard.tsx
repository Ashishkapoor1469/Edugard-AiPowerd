import React, { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";

interface Mentor {
  _id: string;
  name: string;
  email: string;
  status: string;
  department: string;
  maxStudents: number;
}

interface Student {
  _id: string;
  name: string;
  rollNo: string;
  email: string;
  class: string;
}

interface College {
  _id: string;
  name: string;
  location: string;
  website: string;
}

interface Degree {
  _id: string;
  name: string;
  collegeId: string;
}

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"mentors" | "colleges" | "syllabus" | "announcements" | "events" | "students">("mentors");

  // State
  const [pendingMentors, setPendingMentors] = useState<Mentor[]>([]);
  const [allMentors, setAllMentors] = useState<Mentor[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [, setDegrees] = useState<Degree[]>([]);

  // Inputs
  const [collegeName, setCollegeName] = useState("");
  const [collegeLocation, setCollegeLocation] = useState("");
  const [collegeWebsite, setCollegeWebsite] = useState("");
  const [degreeName, setDegreeName] = useState("");
  const [degreeCollegeId, setDegreeCollegeId] = useState("");

  const [annTitle, setAnnTitle] = useState("");
  const [annDesc, setAnnDesc] = useState("");
  const [annTarget, setAnnTarget] = useState("all");
  const [annExpiry, setAnnExpiry] = useState("");

  const [evtName, setEvtName] = useState("");
  const [evtDesc, setEvtDesc] = useState("");
  const [evtDate, setEvtDate] = useState("");
  const [evtLocation, setEvtLocation] = useState("");
  const [evtLink, setEvtLink] = useState("");

  // Syllabus generator state
  const [syllUniv, setSyllUniv] = useState("HPU");
  const [syllCourse, setSyllCourse] = useState("BCA");
  const [generatedSyllabus, setGeneratedSyllabus] = useState("");
  const [generatingSyllabus, setGeneratingSyllabus] = useState(false);

  // Fetch Data
  const fetchData = async () => {
    try {
      const pmRes = await axios.get("/api/admin/mentors/pending");
      if (pmRes.data.success) setPendingMentors(pmRes.data.data);

      const mRes = await axios.get("/api/mentors/list");
      if (mRes.data.success) setAllMentors(mRes.data.data);

      const sRes = await axios.get("/api/students", { params: { limit: 50 } });
      if (sRes.data.success) setAllStudents(sRes.data.data);

      const cRes = await axios.get("/api/admin/colleges");
      if (cRes.data.success) setColleges(cRes.data.data);

      const dRes = await axios.get("/api/admin/degrees");
      if (dRes.data.success) setDegrees(dRes.data.data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load administration data");
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Actions
  const handleUpdateStatus = async (id: string, status: "approved" | "rejected" | "disabled") => {
    try {
      const res = await axios.post(`/api/admin/mentors/${id}/status`, { status });
      if (res.data.success) {
        toast.success(`Mentor status set to ${status}`);
        fetchData();
      }
    } catch (err) {
      toast.error("Action failed");
    }
  };

  const handleCreateCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/api/admin/colleges", {
        name: collegeName,
        location: collegeLocation,
        website: collegeWebsite,
      });
      if (res.data.success) {
        toast.success("College registered successfully!");
        setCollegeName("");
        setCollegeLocation("");
        setCollegeWebsite("");
        fetchData();
      }
    } catch (err) {
      toast.error("Registration failed");
    }
  };

  const handleCreateDegree = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/api/admin/degrees", {
        name: degreeName,
        collegeId: degreeCollegeId,
      });
      if (res.data.success) {
        toast.success("Degree program configured!");
        setDegreeName("");
        setDegreeCollegeId("");
        fetchData();
      }
    } catch (err) {
      toast.error("Configuration failed");
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/api/admin/announcements", {
        title: annTitle,
        description: annDesc,
        targetAudience: annTarget,
        collegeId: colleges[0]?._id, // default to first college
        expiryDate: annExpiry ? new Date(annExpiry) : null,
      });
      if (res.data.success) {
        toast.success("Announcement broadcasted successfully!");
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
      const res = await axios.post("/api/admin/events", {
        eventName: evtName,
        description: evtDesc,
        date: new Date(evtDate),
        location: evtLocation,
        registrationLink: evtLink,
        collegeId: colleges[0]?._id,
      });
      if (res.data.success) {
        toast.success("College event scheduled!");
        setEvtName("");
        setEvtDesc("");
        setEvtDate("");
        setEvtLocation("");
        setEvtLink("");
      }
    } catch (err) {
      toast.error("Failed to create event");
    }
  };

  const handleGenerateSyllabus = async () => {
    setGeneratingSyllabus(true);
    try {
      const res = await axios.get("/api/admin/university/syllabus-auto", {
        params: { university: syllUniv, course: syllCourse },
      });
      if (res.data.success) {
        setGeneratedSyllabus(res.data.data);
        toast.success("Course structure auto-generated!");
      }
    } catch (err) {
      toast.error("AI Generation failed");
    } finally {
      setGeneratingSyllabus(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-6 font-sans">
      {/* Top Banner */}
      <div className="mb-6 rounded-2xl bg-white border border-[#dadce0] p-6 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">EduGuard Workspace Administration</h1>
          <p className="text-sm text-[#5f6368] mt-1">Configure multi-college directories, verify academic mentors, and manage portal announcements.</p>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="mb-6 border-b border-[#dadce0] flex gap-2 overflow-x-auto pb-px">
        {[
          { id: "mentors", label: "Mentor Approvals" },
          { id: "colleges", label: "Colleges & Degrees" },
          { id: "syllabus", label: "University syllabus AI" },
          { id: "announcements", label: "Announcements" },
          { id: "events", label: "Events Manager" },
          { id: "students", label: "Student Roster" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 rounded-t-lg transition-all ${
              activeTab === tab.id
                ? "border-[#1a73e8] text-[#1a73e8] bg-blue-50/30"
                : "border-transparent text-[#5f6368] hover:text-[#202124] hover:border-[#dadce0]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="grid grid-cols-1 gap-6">
        {/* 1. MENTOR APPROVALS */}
        {activeTab === "mentors" && (
          <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#202124] mb-4">Pending Verification Requests</h2>
            {pendingMentors.length === 0 ? (
              <p className="text-sm text-[#5f6368] py-8 text-center italic">No pending registrations found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#dadce0] text-[#5f6368] font-medium">
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingMentors.map((m) => (
                      <tr key={m._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3.5 px-4 font-semibold text-[#202124]">{m.name}</td>
                        <td className="py-3.5 px-4 text-[#5f6368]">{m.email}</td>
                        <td className="py-3.5 px-4 text-[#5f6368] capitalize">{m.department || "N/A"}</td>
                        <td className="py-3.5 px-4 text-right flex justify-end gap-2">
                          <button
                            onClick={() => handleUpdateStatus(m._id, "approved")}
                            className="bg-[#1a73e8] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#1557b0] transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(m._id, "rejected")}
                            className="bg-white border border-[#dadce0] text-[#d93025] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-50 transition-colors"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="text-lg font-semibold text-[#202124] mt-8 mb-4">All Active Mentors</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#dadce0] text-[#5f6368] font-medium">
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allMentors.map((m) => (
                    <tr key={m._id} className="border-b border-slate-50">
                      <td className="py-3 px-4 font-semibold text-[#202124]">{m.name}</td>
                      <td className="py-3 px-4 text-[#5f6368]">{m.email}</td>
                      <td className="py-3 px-4 text-[#5f6368] capitalize">{m.department || "N/A"}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          m.status === "approved" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        }`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {m.status !== "disabled" && (
                          <button
                            onClick={() => handleUpdateStatus(m._id, "disabled")}
                            className="text-[#d93025] hover:underline text-xs font-semibold"
                          >
                            Disable
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. COLLEGES & DEGREES */}
        {activeTab === "colleges" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-[#202124] mb-4">Register New College</h2>
              <form onSubmit={handleCreateCollege} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">College Name</label>
                  <input
                    type="text"
                    required
                    value={collegeName}
                    onChange={(e) => setCollegeName(e.target.value)}
                    placeholder="e.g. Govt Degree College"
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Location</label>
                  <input
                    type="text"
                    required
                    value={collegeLocation}
                    onChange={(e) => setCollegeLocation(e.target.value)}
                    placeholder="e.g. Shimla, HP"
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Website URL</label>
                  <input
                    type="url"
                    value={collegeWebsite}
                    onChange={(e) => setCollegeWebsite(e.target.value)}
                    placeholder="e.g. https://gdcshimla.edu"
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                  />
                </div>
                <button type="submit" className="w-full bg-[#1a73e8] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#1557b0] transition-colors">
                  Create College
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-[#202124] mb-4">Configure Degree Program</h2>
              <form onSubmit={handleCreateDegree} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Select College</label>
                  <select
                    required
                    value={degreeCollegeId}
                    onChange={(e) => setDegreeCollegeId(e.target.value)}
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none bg-white"
                  >
                    <option value="">Choose College...</option>
                    {colleges.map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Degree Name</label>
                  <input
                    type="text"
                    required
                    value={degreeName}
                    onChange={(e) => setDegreeName(e.target.value)}
                    placeholder="e.g. BCA, BBA, B.Tech CSE"
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                  />
                </div>
                <button type="submit" className="w-full bg-[#1a73e8] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#1557b0] transition-colors">
                  Add Degree Program
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 3. SYLLABUS GENERATOR */}
        {activeTab === "syllabus" && (
          <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#202124] mb-2">University Syllabus AI Fetcher</h2>
            <p className="text-xs text-[#5f6368] mb-6">Autodetect course structural details, subjects, and credits dynamically using NVIDIA NIM LLM endpoints.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Board / University</label>
                <input
                  type="text"
                  value={syllUniv}
                  onChange={(e) => setSyllUniv(e.target.value)}
                  placeholder="e.g. HPU, HP Board"
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Course / Subject</label>
                <input
                  type="text"
                  value={syllCourse}
                  onChange={(e) => setSyllCourse(e.target.value)}
                  placeholder="e.g. BCA, BBA"
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleGenerateSyllabus}
                  disabled={generatingSyllabus}
                  className="w-full bg-[#1a73e8] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1557b0] disabled:bg-slate-300 transition-colors"
                >
                  {generatingSyllabus ? "Searching & Generating..." : "Generate Syllabus Structure"}
                </button>
              </div>
            </div>

            {generatedSyllabus && (
              <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/20 max-h-96 overflow-y-auto">
                <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap">{generatedSyllabus}</pre>
              </div>
            )}
          </div>
        )}

        {/* 4. ANNOUNCEMENTS */}
        {activeTab === "announcements" && (
          <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm max-w-xl mx-auto w-full">
            <h2 className="text-lg font-semibold text-[#202124] mb-4">Create Announcement</h2>
            <form onSubmit={handleCreateAnnouncement} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Target Audience</label>
                <select
                  value={annTarget}
                  onChange={(e) => setAnnTarget(e.target.value)}
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none bg-white"
                >
                  <option value="all">All Users</option>
                  <option value="students">Students Only</option>
                  <option value="mentors">Mentors Only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="e.g. End Semester Exam Registration Dates"
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Description</label>
                <textarea
                  required
                  rows={4}
                  value={annDesc}
                  onChange={(e) => setAnnDesc(e.target.value)}
                  placeholder="Write announcement body details here..."
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={annExpiry}
                  onChange={(e) => setAnnExpiry(e.target.value)}
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                />
              </div>
              <button type="submit" className="w-full bg-[#1a73e8] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#1557b0] transition-colors">
                Publish Announcement
              </button>
            </form>
          </div>
        )}

        {/* 5. EVENTS MANAGER */}
        {activeTab === "events" && (
          <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm max-w-xl mx-auto w-full">
            <h2 className="text-lg font-semibold text-[#202124] mb-4">Post College Event</h2>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Event Name</label>
                <input
                  type="text"
                  required
                  value={evtName}
                  onChange={(e) => setEvtName(e.target.value)}
                  placeholder="e.g. Annual Tech Fest 2026"
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  value={evtDesc}
                  onChange={(e) => setEvtDesc(e.target.value)}
                  placeholder="Event highlights, scheduling, etc."
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Event Date</label>
                  <input
                    type="date"
                    required
                    value={evtDate}
                    onChange={(e) => setEvtDate(e.target.value)}
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Location</label>
                  <input
                    type="text"
                    required
                    value={evtLocation}
                    onChange={(e) => setEvtLocation(e.target.value)}
                    placeholder="e.g. Auditorium Hall"
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Registration Link (Optional)</label>
                <input
                  type="url"
                  value={evtLink}
                  onChange={(e) => setEvtLink(e.target.value)}
                  placeholder="https://forms.gle/..."
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-[#1a73e8] focus:outline-none"
                />
              </div>
              <button type="submit" className="w-full bg-[#1a73e8] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#1557b0] transition-colors">
                Publish Event
              </button>
            </form>
          </div>
        )}

        {/* 6. STUDENT ROSTER */}
        {activeTab === "students" && (
          <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#202124] mb-4">Total Registered Student Directory</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#dadce0] text-[#5f6368] font-medium">
                    <th className="py-3 px-4">Roll No</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {allStudents.map((s) => (
                    <tr key={s._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono text-[#202124] font-semibold">#{s.rollNo}</td>
                      <td className="py-3 px-4 text-[#202124] font-medium">{s.name}</td>
                      <td className="py-3 px-4 text-[#5f6368]">{s.email || "N/A"}</td>
                      <td className="py-3 px-4 text-[#5f6368]">{s.class}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
