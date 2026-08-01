import React, { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { ErrorState, LoadingState } from "../components/AsyncState.js";

interface College {
  _id: string;
  name: string;
  location: string;
  address: string;
  website: string;
  contactInfo: string;
  isBlocked: boolean;
}

interface CollegeStats {
  collegeId: string;
  collegeName: string;
  location: string;
  isBlocked: boolean;
  mentorsCount: number;
  studentsCount: number;
}

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"colleges" | "college-admins" | "stats">("colleges");

  // State
  const [colleges, setColleges] = useState<College[]>([]);
  const [stats, setStats] = useState<CollegeStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [action, setAction] = useState("");

  // College Form State
  const [collegeName, setCollegeName] = useState("");
  const [collegeLocation, setCollegeLocation] = useState("");
  const [collegeAddress, setCollegeAddress] = useState("");
  const [collegeWebsite, setCollegeWebsite] = useState("");
  const [collegeContact, setCollegeContact] = useState("");

  // Edit College State
  const [editingCollege, setEditingCollege] = useState<College | null>(null);

  // College Admin Form State
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminCollegeId, setAdminCollegeId] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const cRes = await axios.get("/api/admin/colleges");
      if (cRes.data.success) setColleges(cRes.data.data);

      const sRes = await axios.get("/api/admin/colleges/stats");
      if (sRes.data.success) setStats(sRes.data.data);
    } catch (err) {
      console.error(err);
      setLoadError("Failed to load administration data.");
      toast.error("Failed to load administration data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleCreateCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    setAction("create-college");
    try {
      const res = await axios.post("/api/admin/colleges", {
        name: collegeName,
        location: collegeLocation,
        address: collegeAddress,
        website: collegeWebsite,
        contactInfo: collegeContact,
      });
      if (res.data.success) {
        toast.success("College registered successfully!");
        setCollegeName("");
        setCollegeLocation("");
        setCollegeAddress("");
        setCollegeWebsite("");
        setCollegeContact("");
        await fetchData();
      }
    } catch (err) {
      toast.error("Registration failed");
    } finally { setAction(""); }
  };

  const handleUpdateCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCollege) return;
    setAction("update-college");
    try {
      const res = await axios.put(`/api/admin/colleges/${editingCollege._id}`, editingCollege);
      if (res.data.success) {
        toast.success("College details updated successfully!");
        setEditingCollege(null);
        await fetchData();
      }
    } catch (err) {
      toast.error("Failed to update college details");
    } finally { setAction(""); }
  };

  const handleToggleBlockCollege = async (id: string, currentlyBlocked: boolean) => {
    setAction(`block:${id}`);
    try {
      const res = await axios.post(`/api/admin/colleges/${id}/block`, null, {
        params: { block: !currentlyBlocked }
      });
      if (res.data.success) {
        toast.success(`College successfully ${!currentlyBlocked ? "blocked" : "unblocked"}!`);
        await fetchData();
      }
    } catch (err) {
      toast.error("Failed to update block status");
    } finally { setAction(""); }
  };

  const handleRegisterCollegeAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminCollegeId) {
      toast.error("Please select a college");
      return;
    }
    setAction("create-admin");
    try {
      const res = await axios.post("/api/admin/college-admins", {
        name: adminName,
        email: adminEmail,
        password: adminPassword,
        collegeId: adminCollegeId,
      });
      if (res.status === 201 || res.data.success) {
        toast.success("College Admin registered successfully!");
        setAdminName("");
        setAdminEmail("");
        setAdminPassword("");
        setAdminCollegeId("");
        await fetchData();
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to register College Admin";
      toast.error(msg);
    } finally { setAction(""); }
  };

  return (
    <div className="main-content flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-6 font-sans">
      {/* Top Header */}
      <div className="mb-6 rounded-2xl bg-white border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Workspace Portal Administration</h1>
          <p className="text-xs text-slate-500 mt-1">Register SaaS colleges, manage access control, and track global network statistics.</p>
        </div>
        <div className="text-xs font-semibold text-primary bg-primary/5 border border-primary/15 rounded-lg px-3 py-1.5 self-start md:self-auto uppercase tracking-wider">
          Super Admin Panel
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="mb-6 border-b border-slate-200 flex gap-2 overflow-x-auto pb-px">
        {[
          { id: "colleges", label: "Colleges Directory" },
          { id: "college-admins", label: "Register College Admins" },
          { id: "stats", label: "College Strength Stats" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-xs font-bold border-b-2 rounded-t-lg transition-all ${
              activeTab === tab.id
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Panels */}
      {loading ? (
        <LoadingState label="Loading administration data…" />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={fetchData} />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* TAB 1: COLLEGES DIRECTORY */}
          {activeTab === "colleges" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* College Registration / Edit Form */}
              <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs h-fit">
                <h2 className="text-sm font-bold text-slate-800 mb-4">
                  {editingCollege ? "Edit College Details" : "Register New College"}
                </h2>
                {editingCollege ? (
                  <form onSubmit={handleUpdateCollege} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">College Name</label>
                      <input
                        type="text"
                        required
                        value={editingCollege.name}
                        onChange={(e) => setEditingCollege({ ...editingCollege, name: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Location</label>
                      <input
                        type="text"
                        required
                        value={editingCollege.location}
                        onChange={(e) => setEditingCollege({ ...editingCollege, location: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Address</label>
                      <textarea
                        required
                        rows={2}
                        value={editingCollege.address || ""}
                        onChange={(e) => setEditingCollege({ ...editingCollege, address: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Website URL</label>
                      <input
                        type="url"
                        value={editingCollege.website}
                        onChange={(e) => setEditingCollege({ ...editingCollege, website: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Contact Info</label>
                      <input
                        type="text"
                        value={editingCollege.contactInfo || ""}
                        onChange={(e) => setEditingCollege({ ...editingCollege, contactInfo: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={!!action}
                        className="flex-1 bg-primary text-white py-1.5 rounded-lg text-xs font-bold hover:bg-primary-hover transition-colors"
                      >
                        {action === "update-college" ? "Saving…" : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCollege(null)}
                        className="flex-1 border border-slate-200 text-slate-600 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleCreateCollege} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">College Name</label>
                      <input
                        type="text"
                        required
                        value={collegeName}
                        onChange={(e) => setCollegeName(e.target.value)}
                        placeholder="e.g. Chandigarh Engineering College"
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Location / City</label>
                      <input
                        type="text"
                        required
                        value={collegeLocation}
                        onChange={(e) => setCollegeLocation(e.target.value)}
                        placeholder="e.g. Mohali, Punjab"
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Full Address</label>
                      <textarea
                        required
                        rows={2}
                        value={collegeAddress}
                        onChange={(e) => setCollegeAddress(e.target.value)}
                        placeholder="Complete postal address..."
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Official Website</label>
                      <input
                        type="url"
                        value={collegeWebsite}
                        onChange={(e) => setCollegeWebsite(e.target.value)}
                        placeholder="e.g. https://www.cgc.edu.in"
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Contact Email/Phone</label>
                      <input
                        type="text"
                        value={collegeContact}
                        onChange={(e) => setCollegeContact(e.target.value)}
                        placeholder="e.g. info@cgc.edu.in"
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!!action}
                      className="w-full bg-primary text-white py-1.5 rounded-lg text-xs font-bold hover:bg-primary-hover transition-colors pt-2"
                    >
                      {action === "create-college" ? "Registering…" : "Register College"}
                    </button>
                  </form>
                )}
              </div>

              {/* Registered Colleges List */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                <h2 className="text-sm font-bold text-slate-800 mb-4">Registered Colleges</h2>
                {colleges.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center italic">No colleges registered yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                    {colleges.map((c) => (
                      <div key={c._id} className="py-3.5 flex justify-between items-center gap-4 first:pt-0 last:pb-0">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-slate-800 truncate">{c.name}</span>
                            {c.isBlocked && (
                              <span className="inline-flex rounded-full bg-red-50 text-red-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border border-red-100">
                                Blocked
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500">{c.location} · {c.website || "No Website"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setEditingCollege(c)}
                            className="px-2.5 py-1 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleBlockCollege(c._id, c.isBlocked || false)}
                            disabled={!!action}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                              c.isBlocked
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100"
                                : "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"
                            }`}
                          >
                            {action === `block:${c._id}` ? "Updating…" : c.isBlocked ? "Unblock" : "Block"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: REGISTER COLLEGE ADMINS */}
          {activeTab === "college-admins" && (
            <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <h2 className="text-sm font-bold text-slate-800 mb-1">Create College Administrator</h2>
              <p className="text-[11px] text-slate-500 mb-5">College admins are restricted to managing a single, pre-existing college.</p>

              <form onSubmit={handleRegisterCollegeAdmin} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Assigned College</label>
                  <select
                    required
                    value={adminCollegeId}
                    onChange={(e) => setAdminCollegeId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-hidden bg-white font-medium"
                  >
                    <option value="">Select College...</option>
                    {colleges.map((col) => (
                      <option key={col._id} value={col._id}>
                        {col.name} {col.isBlocked ? "(Blocked)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Admin Name</label>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="e.g. Prof. R. K. Sharma"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="e.g. admin@cec.edu.in"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Secure Password</label>
                  <input
                    type="password"
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-hidden"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!!action}
                  className="w-full bg-primary text-white py-2 rounded-lg text-xs font-bold hover:bg-primary-hover transition-colors"
                >
                  {action === "create-admin" ? "Creating…" : "Create Admin Account"}
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: COLLEGE STRENGTH STATS */}
          {activeTab === "stats" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <h2 className="text-sm font-bold text-slate-800 mb-2">College Network Enrollment & Strength</h2>
              <p className="text-[11px] text-slate-500 mb-6">Real-time counts of verified academic mentors and enrolled student profiles per college node.</p>

              {stats.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center italic">No stats available.</p>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="px-4 py-3">College Name</th>
                        <th className="px-4 py-3">Location</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-center">Mentors</th>
                        <th className="px-4 py-3 text-center">Students</th>
                        <th className="px-4 py-3 text-center">Total Strength</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-xs">
                      {stats.map((s) => (
                        <tr key={s.collegeId} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-800">{s.collegeName}</td>
                          <td className="px-4 py-3 text-slate-500">{s.location}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              s.isBlocked ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                            }`}>
                              {s.isBlocked ? "Blocked" : "Active"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-medium text-slate-700">{s.mentorsCount}</td>
                          <td className="px-4 py-3 text-center font-medium text-slate-700">{s.studentsCount}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center h-6 min-w-6 rounded-md bg-primary/5 text-primary text-[10px] font-bold px-1.5">
                              {s.mentorsCount + s.studentsCount}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
