import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useDropzone } from "react-dropzone";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import toast from "react-hot-toast";

interface Student {
  _id: string;
  rollNo: string;
  name: string;
  course: string;
  class: string;
  attendance: number | null;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  behavior: string | null;
  updatedAt: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Search parameters from URL (sync with Navbar)
  const courseFilter = searchParams.get("course") || "";
  const classFilter = searchParams.get("class") || "";
  const searchFilter = searchParams.get("search") || "";

  // Component-level States
  const [students, setStudents] = useState<Student[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // Table filters & sorting
  const [riskFilter, setRiskFilter] = useState("");
  const [sortBy, setSortBy] = useState("riskScore");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  // Fetch Dashboard aggregate stats
  const fetchDashboardStats = async () => {
    setLoadingStats(true);
    try {
      const res = await axios.get("/api/students/stats");
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load dashboard metrics");
    } finally {
      setLoadingStats(false);
    }
  };

  // Fetch student table records
  const fetchStudents = async () => {
    setLoadingStudents(true);
    try {
      const params: any = {
        page,
        limit: 8,
        course: courseFilter,
        class: classFilter,
        search: searchFilter,
      };
      if (riskFilter) {
        params.riskLevel = riskFilter;
      }
      const res = await axios.get("/api/students", { params });
      if (res.data.success) {
        setStudents(res.data.data);
        setTotalPages(res.data.pages);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load student table");
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, [courseFilter, classFilter]); // refetch stats when navbar course/class filters change

  useEffect(() => {
    fetchStudents();
  }, [courseFilter, classFilter, searchFilter, riskFilter, page, sortBy]);

  // Handle Drag & Drop Excel upload
  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setUploadResult(null);
    const toastId = toast.loading("Processing student roster...");

    try {
      const res = await axios.post("/api/students/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.success) {
        toast.success("Roster updated successfully!", { id: toastId });
        setUploadResult(res.data.data);
        fetchDashboardStats();
        fetchStudents();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Excel upload failed", { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: false,
  });

  // Recharts Pie Chart configuration
  const chartData = stats
    ? [
        { name: "Low Risk", value: stats.riskDistribution.low, color: "#10B981" },
        { name: "Medium Risk", value: stats.riskDistribution.medium, color: "#F59E0B" },
        { name: "High Risk", value: stats.riskDistribution.high, color: "#F97316" },
        { name: "Critical", value: stats.riskDistribution.critical, color: "#EF4444" },
      ]
    : [];

  return (
    <div className="flex-1 overflow-y-auto bg-bg-base p-6">
      {/* Page Title */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Dashboard</h1>
          <p className="text-xs text-secondary font-medium">Real-time college academic risk oversight</p>
        </div>
      </div>

      {/* Row 1: Metrics stats */}
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Students */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-secondary uppercase">Total Students</span>
            <span className="rounded-lg bg-indigo-50 p-2 text-primary">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </span>
          </div>
          {loadingStats ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded-md bg-slate-100" />
          ) : (
            <p className="mt-2 text-3xl font-extrabold text-text-primary">{stats?.totalStudents}</p>
          )}
          <span className="mt-1 inline-flex items-center text-[10px] font-bold text-slate-400">Live Sync</span>
        </div>

        {/* High Risk */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-secondary uppercase">At Risk Students</span>
            <span className="rounded-lg bg-red-50 p-2 text-critical">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </span>
          </div>
          {loadingStats ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded-md bg-slate-100" />
          ) : (
            <p className="mt-2 text-3xl font-extrabold text-critical">{stats?.atRiskStudents}</p>
          )}
          <span className="mt-1 inline-flex items-center text-[10px] font-bold text-critical font-semibold">Action Required</span>
        </div>

        {/* Avg Attendance */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-secondary uppercase">Avg Attendance</span>
            <span className="rounded-lg bg-emerald-50 p-2 text-low">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          </div>
          {loadingStats ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded-md bg-slate-100" />
          ) : (
            <p className="mt-2 text-3xl font-extrabold text-text-primary">
              {stats?.avgAttendance !== null ? `${stats?.avgAttendance.toFixed(1)}%` : "N/A"}
            </p>
          )}
          <span className="mt-1 inline-flex items-center text-[10px] font-bold text-slate-400">Steady</span>
        </div>

        {/* Critical Alerts */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-secondary uppercase">Critical Alerts Today</span>
            <span className="rounded-lg bg-orange-50 p-2 text-high">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </span>
          </div>
          {loadingStats ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded-md bg-slate-100" />
          ) : (
            <p className="mt-2 text-3xl font-extrabold text-high">{stats?.criticalAlertsCount}</p>
          )}
          <span className="mt-1 inline-flex items-center text-[10px] font-bold text-high font-semibold">Urgent Alerts</span>
        </div>
      </div>

      {/* Row 2: Charts & Recent Alerts */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Risk Distribution Donut Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2 shadow-xs">
          <h2 className="text-sm font-bold text-text-primary">Risk Distribution</h2>
          <p className="text-[11px] font-medium text-secondary">Real-time academic vulnerability assessment</p>
          <div className="flex h-56 flex-col items-center justify-center sm:flex-row mt-4">
            {loadingStats ? (
              <div className="h-32 w-32 animate-spin rounded-full border-4 border-slate-100 border-t-primary" />
            ) : chartData.length > 0 && stats?.totalStudents > 0 ? (
              <>
                <div className="relative h-44 w-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-text-primary">{stats?.totalStudents}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Total</span>
                  </div>
                </div>

                {/* Legend list */}
                <div className="mt-4 flex flex-col gap-2 sm:ml-8 sm:mt-0">
                  {chartData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <div className="text-xs">
                        <span className="font-bold text-text-primary">{item.name}</span>
                        <span className="ml-2 font-semibold text-secondary">
                          {item.value} ({((item.value / stats.totalStudents) * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">No student distribution data available.</p>
            )}
          </div>
        </div>

        {/* Recent Alerts List */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary">Recent Alerts</h2>
            <button onClick={() => navigate("/notifications")} className="text-xs font-semibold text-primary hover:underline">
              View All
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto max-h-56">
            {loadingStats ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-14 w-full animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : stats?.recentNotifications.length === 0 ? (
              <div className="my-auto text-center text-xs text-slate-400">No recent alerts triggered</div>
            ) : (
              stats?.recentNotifications.map((n: any) => (
                <div
                  key={n._id}
                  onClick={() => navigate(`/students/${n.studentId._id || n.studentId}`)}
                  className="flex cursor-pointer items-start gap-2 border-l-4 border-l-primary bg-slate-50 p-2.5 rounded-r-lg hover:bg-indigo-50/20"
                  style={{ borderLeftColor: n.priority === "urgent" ? "#EF4444" : n.priority === "high" ? "#F97316" : "#F59E0B" }}
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex justify-between items-center w-full">
                      <span className="text-xs font-bold text-text-primary truncate">{n.studentId?.name || "Student"}</span>
                      <span className="text-[9px] text-slate-400 shrink-0 ml-2">
                        {new Date(n.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <span className="text-[10px] text-secondary truncate mt-0.5">{n.message}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Bulk Upload Section */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="mb-3 text-sm font-bold text-text-primary">Batch Student Upload</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`md:col-span-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all ${
              isDragActive ? "border-primary bg-indigo-50/10" : "border-slate-300 hover:border-primary bg-slate-50"
            }`}
          >
            <input {...getInputProps()} />
            <svg className="h-10 w-10 text-primary animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mt-2 text-xs font-semibold text-text-primary">
              Drag & drop files here or <span className="text-primary hover:underline">browse</span>
            </p>
            <span className="mt-1 text-[10px] text-slate-400">Maximum file size: 25MB (.xlsx, .xls only)</span>
          </div>

          {/* Upload Status Card */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/10 p-4">
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wide">Last Import Summary</h3>
            {uploading ? (
              <div className="flex flex-col items-center justify-center h-28">
                <svg className="h-8 w-8 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="mt-2 text-[10px] font-semibold text-secondary">Uploading and parsing spreadsheet...</p>
              </div>
            ) : uploadResult ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-secondary">New Students Created:</span>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">{uploadResult.created}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-secondary">Records Updated:</span>
                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-bold text-primary">{uploadResult.updated}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-secondary">Skipped/Errors:</span>
                  <span className={`rounded-md px-2 py-0.5 font-bold ${uploadResult.skipped > 0 ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-800"}`}>{uploadResult.skipped}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-28 text-center text-xs text-slate-400">
                Upload your first Excel file to populate database.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Student Performance Overview Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex flex-col justify-between sm:flex-row sm:items-center">
          <h2 className="text-sm font-bold text-text-primary">Student Performance Overview</h2>
          <div className="mt-2 flex items-center gap-2 sm:mt-0">
            {/* Risk filter chips */}
            {["", "low", "medium", "high", "critical"].map((level) => (
              <button
                key={level}
                onClick={() => {
                  setRiskFilter(level);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all border ${
                  riskFilter === level
                    ? "bg-primary border-primary text-white shadow-xs"
                    : "bg-white border-slate-200 text-secondary hover:bg-slate-50"
                }`}
              >
                {level === "" ? "All" : level}
              </button>
            ))}
          </div>
        </div>

        {/* Student Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-secondary uppercase tracking-wider bg-slate-50/50">
                <th className="py-3 px-4">Roll No</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Class</th>
                <th className="py-3 px-4">Attendance</th>
                <th className="py-3 px-4">Risk Level</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingStudents ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td colSpan={6} className="py-4 px-4">
                      <div className="h-5 w-full animate-pulse rounded-md bg-slate-50" />
                    </td>
                  </tr>
                ))
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                    No student records found. Add students by uploading an Excel sheet.
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr
                    key={student._id}
                    onClick={() => navigate(`/students/${student._id}`)}
                    className="border-b border-slate-100 hover:bg-indigo-50/10 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 text-xs font-bold text-text-primary">#{student.rollNo}</td>
                    <td className="py-3 px-4 text-xs font-semibold text-text-primary">{student.name}</td>
                    <td className="py-3 px-4 text-xs font-medium text-secondary">
                      {student.course} · {student.class}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {student.attendance !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                student.attendance < 50 ? "bg-critical" : student.attendance < 75 ? "bg-high" : "bg-low"
                              }`}
                              style={{ width: `${student.attendance}%` }}
                            />
                          </div>
                          <span className="font-bold text-text-primary">{student.attendance}%</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          student.riskLevel === "low"
                            ? "bg-emerald-50 text-low"
                            : student.riskLevel === "medium"
                            ? "bg-amber-50 text-medium"
                            : student.riskLevel === "high"
                            ? "bg-orange-50 text-high"
                            : "bg-red-50 text-critical animate-pulse"
                        }`}
                      >
                        {student.riskLevel}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/students/${student._id}`);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary transition-all"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-semibold text-secondary">
            <span>Showing page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
