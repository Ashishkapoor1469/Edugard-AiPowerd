import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useDropzone } from "react-dropzone";
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
  verificationStatus?: string;
  email?: string;
}

interface Assignment {
  _id?: string;
  title: string;
  description: string;
  class: string;
  deadline: string;
  instructions: string;
}

interface Submission {
  _id: string;
  assignmentId: string;
  studentId: string;
  submittedPdfUrl: string;
  grade: string;
  feedback: string;
  submittedAt: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Active workspace tab
  const [activeTab, setActiveTab] = useState<"stream" | "enrollments" | "assignments" | "study-planner">("stream");

  // Route Filters (from Navbar)
  const courseFilter = searchParams.get("course") || "";
  const classFilter = searchParams.get("class") || "";
  const searchFilter = searchParams.get("search") || "";

  // Component States
  const [students, setStudents] = useState<Student[]>([]);
  const [pendingStudents, setPendingStudents] = useState<Student[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Table Filters
  const [riskFilter, setRiskFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Upload State
  const [, setUploading] = useState(false);

  // Assignments States
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [newAsgnTitle, setNewAsgnTitle] = useState("");
  const [newAsgnDesc, setNewAsgnDesc] = useState("");
  const [newAsgnClass, setNewAsgnClass] = useState("BCA-A");
  const [newAsgnDeadline, setNewAsgnDeadline] = useState("");
  const [newAsgnInstructions, setNewAsgnInstructions] = useState("");
  
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedAsgnId, setSelectedAsgnId] = useState("");
  const [gradeScore, setGradeScore] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");
  const [gradingSubId, setGradingSubId] = useState("");

  // AI Study Planner States
  const [plannerStudentId, setPlannerStudentId] = useState("");
  const [plannerWeakSubjects, setPlannerWeakSubjects] = useState("");
  const [plannerSpeed, setPlannerSpeed] = useState("Normal");
  const [plannerExams, setPlannerExams] = useState("");
  const [generatedPlan, setGeneratedPlan] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const fetchDashboardStats = async () => {
    try {
      const res = await axios.get("/api/students/stats");
      if (res.data.success) setStats(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params: any = {
        page,
        limit: 8,
        course: courseFilter,
        class: classFilter,
        search: searchFilter,
      };
      if (riskFilter) params.riskLevel = riskFilter;

      const res = await axios.get("/api/students", { params });
      if (res.data.success) {
        setStudents(res.data.data);
        setTotalPages(res.data.pages);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch students list");
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingStudents = async () => {
    try {
      // Fetch students pending mentor verification
      const res = await axios.get("/api/students", {
        params: { limit: 50 },
      });
      if (res.data.success) {
        setPendingStudents(
          res.data.data.filter((s: Student) => s.verificationStatus === "pending_mentor_approval")
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAssignments = async () => {
    try {
      const res = await axios.get("/api/students/assignments", {
        params: { courseId: "", class: classFilter || "BCA-A" },
      });
      if (res.data.success) setAssignments(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, [courseFilter, classFilter]);

  useEffect(() => {
    fetchStudents();
    fetchPendingStudents();
    fetchAssignments();
  }, [courseFilter, classFilter, searchFilter, riskFilter, page, activeTab]);

  // Actions
  const handleApproveStudent = async (id: string, approve: boolean) => {
    try {
      const res = await axios.post(`/api/students/${id}/verify`, { approve });
      if (res.data.success) {
        toast.success(approve ? "Student enrollment approved!" : "Enrollment rejected.");
        fetchPendingStudents();
      }
    } catch (err) {
      toast.error("Action failed");
    }
  };

  // Dropzone Excel upload
  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    toast.loading("Parsing Excel student roster...", { id: "excel-upload" });

    try {
      const res = await axios.post("/api/students/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.success) {
        toast.success("Excel student roster successfully parsed & merged!", { id: "excel-upload" });
        fetchStudents();
      }
    } catch (err) {
      toast.error("Roster Excel parsing failed. Validate column headers.", { id: "excel-upload" });
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    multiple: false,
  });

  // Assignments Actions
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/api/students/assignments", {
        title: newAsgnTitle,
        description: newAsgnDesc,
        class: newAsgnClass,
        deadline: newAsgnDeadline,
        instructions: newAsgnInstructions,
        mentorId: stats?.mentorId || "dev-mentor",
      });
      if (res.data.success) {
        toast.success("Assignment created!");
        setNewAsgnTitle("");
        setNewAsgnDesc("");
        setNewAsgnInstructions("");
        fetchAssignments();
      }
    } catch (err) {
      toast.error("Failed to create assignment");
    }
  };

  const fetchSubmissions = async (asgnId: string) => {
    setSelectedAsgnId(asgnId);
    try {
      const res = await axios.get(`/api/students/assignments/${asgnId}/submissions`);
      if (res.data.success) setSubmissions(res.data.data);
    } catch (err) {
      toast.error("Failed to retrieve submissions");
    }
  };

  const handleGradeSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post(`/api/students/submissions/${gradingSubId}/grade`, {
        grade: gradeScore,
        feedback: gradeFeedback,
      });
      if (res.data.success) {
        toast.success("Submission graded!");
        setGradingSubId("");
        setGradeScore("");
        setGradeFeedback("");
        fetchSubmissions(selectedAsgnId);
      }
    } catch (err) {
      toast.error("Grading failed");
    }
  };

  // AI Study Planner Actions
  const handleGenerateStudyPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plannerStudentId) {
      toast.error("Please select a student");
      return;
    }

    setGeneratingPlan(true);
    try {
      const res = await axios.post(`/api/students/study-planner/${plannerStudentId}`, {
        weakSubjects: plannerWeakSubjects,
        learningSpeed: plannerSpeed,
        upcomingExams: plannerExams,
      });
      if (res.data.success) {
        setGeneratedPlan(res.data.plan);
        toast.success("AI Personalized Study Plan generated!");
      }
    } catch (err) {
      toast.error("Failed to generate planner");
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleSendPlannerToStudent = async () => {
    // Mentors can edit generated plan before saving
    try {
      await axios.patch(`/api/students/${plannerStudentId}`, {
        aiImprovementPlan: generatedPlan,
      });
      toast.success("Study plan successfully sent to the student profile!");
      setGeneratedPlan("");
      setPlannerStudentId("");
    } catch (err) {
      toast.error("Failed to save plan");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-6 font-sans">
      {/* Mentor Stream Header */}
      <div className="mb-6 rounded-2xl bg-white border border-[#dadce0] p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">Instructor Dashboard</h1>
          <p className="text-xs text-[#5f6368] mt-1 font-medium">Class: {classFilter || "BCA-A"} · Active capacity limit: 50 students</p>
        </div>

        {/* Excel Import Card */}
        <div {...getRootProps()} className="border border-dashed border-[#dadce0] rounded-xl px-4 py-3 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors text-center max-w-xs w-full">
          <input {...getInputProps()} />
          <span className="text-xs font-semibold text-[#1a73e8]">Upload Student Excel Roster</span>
          <p className="text-[10px] text-[#5f6368] mt-0.5">Drag and drop .xlsx file to import / merge grades</p>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="mb-6 border-b border-[#dadce0] flex gap-2 overflow-x-auto pb-px">
        {[
          { id: "stream", label: "Students Stream" },
          { id: "enrollments", label: `Enrollments (${pendingStudents.length})` },
          { id: "assignments", label: "Assignments manager" },
          { id: "study-planner", label: "AI Study Planner" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 rounded-t-lg transition-all ${
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
        {/* 1. STUDENTS STREAM */}
        {activeTab === "stream" && (
          <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-lg font-semibold text-[#202124]">Enrolled Roster</h2>
              
              {/* Risk Level Filter dropdown */}
              <div className="flex gap-2">
                {["", "low", "medium", "high", "critical"].map((risk) => (
                  <button
                    key={risk}
                    onClick={() => setRiskFilter(risk)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold capitalize transition-all ${
                      riskFilter === risk
                        ? "bg-[#1a73e8] border-[#1a73e8] text-white"
                        : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-slate-50"
                    }`}
                  >
                    {risk || "All Risk Levels"}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-center py-10">Loading class data...</p>
            ) : students.length === 0 ? (
              <p className="text-sm text-center py-10 text-[#5f6368] italic">No matching student records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#dadce0] text-[#5f6368] font-medium">
                      <th className="py-3 px-4">Roll No</th>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Class</th>
                      <th className="py-3 px-4">Attendance</th>
                      <th className="py-3 px-4">Risk Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-semibold">#{s.rollNo}</td>
                        <td className="py-3 px-4 font-semibold text-[#202124]">{s.name}</td>
                        <td className="py-3 px-4 text-[#5f6368]">{s.class}</td>
                        <td className="py-3 px-4 text-[#5f6368]">{s.attendance != null ? `${s.attendance}%` : "N/A"}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
                            s.riskLevel === "low" ? "bg-green-50 text-green-700" :
                            s.riskLevel === "medium" ? "bg-amber-50 text-amber-700" :
                            s.riskLevel === "high" ? "bg-orange-50 text-orange-700" : "bg-red-50 text-red-700"
                          }`}>
                            {s.riskLevel}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => navigate(`/students/${s._id}`)}
                            className="text-[#1a73e8] hover:underline font-semibold text-xs"
                          >
                            Manage Profile
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-semibold text-[#5f6368]">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. ENROLLMENT APPROVALS */}
        {activeTab === "enrollments" && (
          <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#202124] mb-4">Pending Student Registrations</h2>
            {pendingStudents.length === 0 ? (
              <p className="text-sm text-[#5f6368] py-8 text-center italic">No pending enrollment requests.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#dadce0] text-[#5f6368] font-medium">
                      <th className="py-3 px-4">Roll No</th>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingStudents.map((s) => (
                      <tr key={s._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3.5 px-4 font-mono font-semibold">#{s.rollNo}</td>
                        <td className="py-3.5 px-4 font-semibold text-[#202124]">{s.name}</td>
                        <td className="py-3.5 px-4 text-[#5f6368]">{s.email}</td>
                        <td className="py-3.5 px-4 text-right flex justify-end gap-2">
                          <button
                            onClick={() => handleApproveStudent(s._id, true)}
                            className="bg-[#1a73e8] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#1557b0] transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApproveStudent(s._id, false)}
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
          </div>
        )}

        {/* 3. ASSIGNMENTS MANAGER */}
        {activeTab === "assignments" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Assignment Form */}
            <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-[#202124] mb-4">Post Assignment Task</h2>
              <form onSubmit={handleCreateAssignment} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Target Class</label>
                  <select
                    value={newAsgnClass}
                    onChange={(e) => setNewAsgnClass(e.target.value)}
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none bg-white font-medium"
                  >
                    <option value="BCA-A">BCA-A</option>
                    <option value="BCA-B">BCA-B</option>
                    <option value="BBA-A">BBA-A</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Assignment Title</label>
                  <input
                    type="text"
                    required
                    value={newAsgnTitle}
                    onChange={(e) => setNewAsgnTitle(e.target.value)}
                    placeholder="e.g. Stack Operations Implementation in C"
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Detailed Description</label>
                  <textarea
                    required
                    rows={3}
                    value={newAsgnDesc}
                    onChange={(e) => setNewAsgnDesc(e.target.value)}
                    placeholder="Provide description of programming tasks or assignment requirements..."
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Instructions / Guidelines</label>
                  <input
                    type="text"
                    value={newAsgnInstructions}
                    onChange={(e) => setNewAsgnInstructions(e.target.value)}
                    placeholder="e.g. Upload PDF. Late submissions carry 10% penalty."
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5f6368] mb-1">Submission Deadline</label>
                  <input
                    type="date"
                    required
                    value={newAsgnDeadline}
                    onChange={(e) => setNewAsgnDeadline(e.target.value)}
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <button type="submit" className="w-full bg-[#1a73e8] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1557b0] transition-colors">
                  Publish Assignment Link
                </button>
              </form>
            </div>

            {/* List & Grade Submissions */}
            <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm flex flex-col gap-6">
              <div>
                <h2 className="text-lg font-semibold text-[#202124] mb-3">Evaluate Submissions</h2>
                {assignments.length === 0 ? (
                  <p className="text-xs text-[#5f6368] italic">No assignments active.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {assignments.map((a) => (
                      <button
                        key={a._id}
                        onClick={() => fetchSubmissions(a._id!)}
                        className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition-all ${
                          selectedAsgnId === a._id
                            ? "bg-indigo-50 border-[#1a73e8] text-[#1a73e8]"
                            : "bg-white border-[#dadce0] text-[#5f6368]"
                        }`}
                      >
                        {a.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedAsgnId && (
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-[#202124] mb-2">Student Submissions</h3>
                  {submissions.length === 0 ? (
                    <p className="text-xs text-[#5f6368] py-4 italic">No uploads received yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {submissions.map((sub) => (
                        <div key={sub._id} className="p-3 border border-slate-100 rounded-xl bg-slate-50/50 flex flex-col gap-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-primary">Student Submission Record</span>
                            <a
                              href={sub.submittedPdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline font-bold"
                            >
                              Download PDF File
                            </a>
                          </div>

                          {sub.grade ? (
                            <div className="text-xs text-[#5f6368]">
                              <span className="font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Grade: {sub.grade}</span>
                              <p className="mt-1">Feedback: {sub.feedback}</p>
                            </div>
                          ) : (
                            <button
                              onClick={() => setGradingSubId(sub._id)}
                              className="text-xs font-bold text-primary self-start hover:underline"
                            >
                              Grade Task
                            </button>
                          )}

                          {gradingSubId === sub._id && (
                            <form onSubmit={handleGradeSubmission} className="space-y-2 mt-2 border-t pt-2">
                              <div className="grid grid-cols-3 gap-2">
                                <input
                                  type="text"
                                  placeholder="Grade (A, B+)"
                                  required
                                  value={gradeScore}
                                  onChange={(e) => setGradeScore(e.target.value)}
                                  className="col-span-1 border rounded-lg px-2.5 py-1 text-xs focus:outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder="Feedback comments"
                                  required
                                  value={gradeFeedback}
                                  onChange={(e) => setGradeFeedback(e.target.value)}
                                  className="col-span-2 border rounded-lg px-2.5 py-1 text-xs focus:outline-none"
                                />
                              </div>
                              <button type="submit" className="bg-[#1a73e8] text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-[#1557b0]">
                                Submit Score
                              </button>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. AI STUDY PLANNER */}
        {activeTab === "study-planner" && (
          <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#202124] mb-2">AI Personalized Study Planner</h2>
            <p className="text-xs text-[#5f6368] mb-6">Build week-by-week study guidelines, targets, and practice tasks dynamically customized for lagging students.</p>

            <form onSubmit={handleGenerateStudyPlan} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Select Student</label>
                <select
                  required
                  value={plannerStudentId}
                  onChange={(e) => setPlannerStudentId(e.target.value)}
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none bg-white font-medium"
                >
                  <option value="">Choose Enrolled Student...</option>
                  {students.map((s) => (
                    <option key={s._id} value={s._id}>#{s.rollNo} {s.name} ({s.riskLevel} risk)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Weak Subjects</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mathematics-I, C Programming"
                  value={plannerWeakSubjects}
                  onChange={(e) => setPlannerWeakSubjects(e.target.value)}
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Learning Speed</label>
                <select
                  value={plannerSpeed}
                  onChange={(e) => setPlannerSpeed(e.target.value)}
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none bg-white font-medium"
                >
                  <option value="Slow">Slow & Detailed</option>
                  <option value="Normal">Normal pace</option>
                  <option value="Fast">Fast & Intensive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Upcoming Exams</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. House Exams in 2 weeks"
                  value={plannerExams}
                  onChange={(e) => setPlannerExams(e.target.value)}
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={generatingPlan}
                  className="w-full bg-[#1a73e8] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1557b0] disabled:bg-slate-300 transition-colors"
                >
                  {generatingPlan ? "Constructing Plan..." : "Generate AI Planner"}
                </button>
              </div>
            </form>

            {generatedPlan && (
              <div className="space-y-4">
                <div className="border border-[#dadce0] rounded-2xl overflow-hidden shadow-xs bg-slate-50/20">
                  <div className="px-4 py-2 border-b border-[#dadce0] bg-slate-50 flex justify-between items-center">
                    <span className="text-xs font-bold text-[#202124]">Review and Edit Study Plan (Markdown Box)</span>
                    <button
                      onClick={handleSendPlannerToStudent}
                      className="bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-800 transition-colors"
                    >
                      Deliver Plan to Student Profile
                    </button>
                  </div>
                  <textarea
                    rows={12}
                    value={generatedPlan}
                    onChange={(e) => setGeneratedPlan(e.target.value)}
                    className="w-full p-4 font-mono text-xs text-slate-800 border-none focus:outline-none focus:ring-0 bg-transparent resize-y"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
