import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useDropzone } from "react-dropzone";
import toast from "react-hot-toast";
import { listLoadError } from "../utils/apiErrors.js";
import { downloadFile } from "../utils/downloadFile.js";
import { ErrorState, LoadingState } from "../components/AsyncState.js";

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
  const [activeTab, setActiveTab] = useState<"stream" | "enrollments" | "assignments" | "study-planner" | "report-cards">("stream");

  // Route Filters (from Navbar)
  const courseFilter = searchParams.get("course") || "";
  const classFilter = searchParams.get("class") || "";
  const searchFilter = searchParams.get("search") || "";

  // Component States
  const [students, setStudents] = useState<Student[]>([]);
  const [pendingStudents, setPendingStudents] = useState<Student[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");
  const [pendingError, setPendingError] = useState("");
  const [pendingLoading, setPendingLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState("");
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [approvingId, setApprovingId] = useState("");
  const studentsRequestId = useRef(0);
  
  // Table Filters
  const [riskFilter, setRiskFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Upload State
  const [uploading, setUploading] = useState(false);

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
  const [creatingAssignment, setCreatingAssignment] = useState(false);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [grading, setGrading] = useState(false);

  // AI Study Planner States
  const [plannerStudentId, setPlannerStudentId] = useState("");
  const [plannerWeakSubjects, setPlannerWeakSubjects] = useState("");
  const [plannerSpeed, setPlannerSpeed] = useState("Normal");
  const [plannerExams, setPlannerExams] = useState("");
  const [generatedPlan, setGeneratedPlan] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [sendingPlan, setSendingPlan] = useState(false);
  const [showExcelHelp, setShowExcelHelp] = useState(false);

  // Report Card states
  const [rcStudentId, setRcStudentId] = useState("");
  const [rcGenerating, setRcGenerating] = useState(false);
  const [rcJobs, setRcJobs] = useState<any[]>([]);
  const [rcLoadingJobs, setRcLoadingJobs] = useState(false);
  const [rcJobsError, setRcJobsError] = useState("");
  const STATS_CACHE_KEY = "eduguard_dashboard_stats";
  const STATS_TTL_MS = 5 * 60 * 1000; // 5 minutes

  const fetchDashboardStats = async () => {
    try {
      // 1. Show cached stats immediately (stale-while-revalidate)
      const cached = sessionStorage.getItem(STATS_CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        setStats(data);
        // If cache is still fresh, skip the network call
        if (Date.now() - timestamp < STATS_TTL_MS) return;
      }

      // 2. Fetch fresh stats in background
      const res = await axios.get("/api/students/stats");
      if (res.data.success) {
        setStats(res.data.data);
        sessionStorage.setItem(
          STATS_CACHE_KEY,
          JSON.stringify({ data: res.data.data, timestamp: Date.now() })
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStudents = async (signal?: AbortSignal) => {
    const requestId = studentsRequestId.current + 1;
    studentsRequestId.current = requestId;
    setLoading(true);
    setStudentsError("");
    try {
      const params: any = {
        page,
        limit: 8,
        course: courseFilter,
        class: classFilter,
        search: searchFilter,
      };
      if (riskFilter) params.riskLevel = riskFilter;

      const res = await axios.get("/api/students", { params, signal });
      if (res.data.success && requestId === studentsRequestId.current) {
        setStudents(res.data.data);
        setTotalPages(res.data.pages);
      }
    } catch (err: unknown) {
      if (axios.isCancel(err)) return; // Request was aborted, ignore
      const message = listLoadError(err, "Failed to fetch students list");
      setStudentsError(message);
      toast.error(message);
    } finally {
      if (!signal?.aborted && requestId === studentsRequestId.current) {
        setLoading(false);
      }
    }
  };

  const fetchPendingStudents = async () => {
    setPendingLoading(true);
    setPendingError("");
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
    } catch (err: unknown) {
      console.error(err);
      setPendingError(listLoadError(err, "Failed to load pending enrollments."));
    } finally { setPendingLoading(false); }
  };

  const fetchAssignments = async () => {
    setAssignmentsLoading(true);
    setAssignmentsError("");
    try {
      const res = await axios.get("/api/students/assignments", {
        params: { courseId: "", class: classFilter || "BCA-A" },
      });
      if (res.data.success) setAssignments(res.data.data);
    } catch (err: unknown) {
      console.error(err);
      setAssignmentsError(listLoadError(err, "Failed to load assignments."));
    } finally { setAssignmentsLoading(false); }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, [courseFilter, classFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetchStudents(controller.signal);
    return () => controller.abort(); // Cancel in-flight requests on dependency change
  }, [courseFilter, classFilter, searchFilter, riskFilter, page]);

  useEffect(() => { fetchPendingStudents(); }, []);
  useEffect(() => { if (activeTab === "assignments") fetchAssignments(); }, [activeTab, classFilter]);

  // Actions
  const handleApproveStudent = async (id: string, approve: boolean) => {
    setApprovingId(id);
    try {
      const res = await axios.post(`/api/students/${id}/verify`, { approve });
      if (res.data.success) {
        toast.success(approve ? "Student enrollment approved!" : "Enrollment rejected.");
        await fetchPendingStudents();
      }
    } catch (err) {
      toast.error("Action failed");
    } finally { setApprovingId(""); }
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
    disabled: uploading,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    multiple: false,
  });

  // Assignments Actions
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingAssignment(true);
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
        await fetchAssignments();
      }
    } catch (err) {
      toast.error("Failed to create assignment");
    } finally { setCreatingAssignment(false); }
  };

  const fetchSubmissions = async (asgnId: string) => {
    setSelectedAsgnId(asgnId);
    setLoadingSubmissions(true);
    try {
      const res = await axios.get(`/api/students/assignments/${asgnId}/submissions`);
      if (res.data.success) setSubmissions(res.data.data);
    } catch (err) {
      toast.error("Failed to retrieve submissions");
    } finally { setLoadingSubmissions(false); }
  };

  const handleGradeSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrading(true);
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
        await fetchSubmissions(selectedAsgnId);
      }
    } catch (err) {
      toast.error("Grading failed");
    } finally { setGrading(false); }
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
    setSendingPlan(true);
    try {
      await axios.patch(`/api/students/${plannerStudentId}`, {
        aiImprovementPlan: generatedPlan,
      });
      toast.success("Study plan successfully sent to the student profile!");
      setGeneratedPlan("");
      setPlannerStudentId("");
    } catch (err) {
      toast.error("Failed to save plan");
    } finally { setSendingPlan(false); }
  };

  return (
    <div className="main-content flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-6 font-sans">
      {/* Mentor Stream Header */}
      <div className="mb-6 rounded-2xl bg-white border border-[#dadce0] p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">Instructor Dashboard</h1>
          <p className="text-xs text-[#5f6368] mt-1 font-medium">Class: {classFilter || "BCA-A"} · Active capacity limit: 50 students</p>
        </div>

        {/* Excel Import Card */}
        <div className="flex items-center gap-2 max-w-xs w-full">
          <div {...getRootProps()} aria-busy={uploading} className="flex-1 border border-dashed border-[#dadce0] rounded-xl px-4 py-3 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors text-center">
            <input {...getInputProps()} />
            <span className="text-xs font-semibold text-[#12274E]">{uploading ? "Uploading roster…" : "Upload Student Excel Roster"}</span>
            <p className="text-[10px] text-[#5f6368] mt-0.5">Drag and drop .xlsx file to import / merge grades</p>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowExcelHelp(true); }}
            className="shrink-0 h-8 w-8 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-[#12274E] hover:border-[#12274E] hover:bg-primary/5 transition-all shadow-sm"
            title="Excel format help"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
        </div>
      </div>

      {/* Excel Help Modal */}
      {showExcelHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowExcelHelp(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">📋 Excel File Format Guide</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Required columns and example data for the student roster</p>
              </div>
              <button onClick={() => setShowExcelHelp(false)} className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {/* Required Fields */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded bg-red-100 text-red-600 flex items-center justify-center text-[9px] font-black">!</span>
                  Required Columns
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {[{col: "RollNo", desc: "Unique student roll number", alt: "roll, studentroll, id"}, {col: "Name", desc: "Full name of student", alt: "studentname, fullname"}].map(f => (
                    <div key={f.col} className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2">
                      <span className="text-[11px] font-bold text-red-700 block">{f.col}</span>
                      <span className="text-[9px] text-red-600/70">{f.desc}</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">Aliases: {f.alt}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Optional Fields */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[9px] font-black">~</span>
                  Optional Columns
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {col: "Email", desc: "Student email", alt: "emailaddress"},
                    {col: "PhoneNo", desc: "Contact number", alt: "phone, mobile, contact"},
                    {col: "Attendance", desc: "Attendance % (0-100)", alt: "att, attendancepercentage"},
                    {col: "Behavior", desc: "Conduct note", alt: "conduct"},
                    {col: "Contribution", desc: "Comma-separated activities", alt: "contributions, cocurricular"},
                  ].map(f => (
                    <div key={f.col} className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
                      <span className="text-[11px] font-bold text-primary block">{f.col}</span>
                      <span className="text-[9px] text-primary/70">{f.desc}</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">Aliases: {f.alt}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Subject Marks */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded bg-purple-100 text-purple-600 flex items-center justify-center text-[9px] font-black">★</span>
                  Subject Marks Columns (Dynamic)
                </h4>
                <p className="text-[10px] text-slate-500 mb-2">Use this pattern: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono text-purple-700">SubjectName_ExamType</code> and <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono text-purple-700">SubjectName_ExamType_Max</code></p>
                <div className="grid grid-cols-3 gap-1.5 text-[9px]">
                  {["Math_Test1","Math_Test1_Max","Math_Test2","Math_MidTerm","Math_MidTerm_Max","Math_HouseExam"].map(c => (
                    <span key={c} className="bg-purple-50 border border-purple-100 text-purple-700 rounded-md px-2 py-1 font-mono text-center">{c}</span>
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
                        {["RollNo","Name","Email","Attendance","Behavior","Math_Test1","Math_Test1_Max","Math_MidTerm"].map(h => (
                          <th key={h} className="px-2.5 py-2 font-bold text-slate-600 text-left border-b border-slate-200 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="px-2.5 py-1.5 text-slate-700">BCA001</td>
                        <td className="px-2.5 py-1.5 text-slate-700">Rahul Sharma</td>
                        <td className="px-2.5 py-1.5 text-slate-500">rahul@mail.com</td>
                        <td className="px-2.5 py-1.5 text-slate-700">85</td>
                        <td className="px-2.5 py-1.5 text-slate-500">Good</td>
                        <td className="px-2.5 py-1.5 text-slate-700">18</td>
                        <td className="px-2.5 py-1.5 text-slate-500">25</td>
                        <td className="px-2.5 py-1.5 text-slate-700">72</td>
                      </tr>
                      <tr>
                        <td className="px-2.5 py-1.5 text-slate-700">BCA002</td>
                        <td className="px-2.5 py-1.5 text-slate-700">Priya Singh</td>
                        <td className="px-2.5 py-1.5 text-slate-500">priya@mail.com</td>
                        <td className="px-2.5 py-1.5 text-slate-700">92</td>
                        <td className="px-2.5 py-1.5 text-slate-500">Excellent</td>
                        <td className="px-2.5 py-1.5 text-slate-700">23</td>
                        <td className="px-2.5 py-1.5 text-slate-500">25</td>
                        <td className="px-2.5 py-1.5 text-slate-700">88</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 px-6 py-3 flex justify-end">
              <button onClick={() => setShowExcelHelp(false)} className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-hover transition-colors">Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="mb-6 border-b border-[#dadce0] flex gap-2 overflow-x-auto pb-px">
        {[
          { id: "stream", label: "Students Stream" },
          { id: "enrollments", label: `Enrollments (${pendingStudents.length})` },
          { id: "assignments", label: "Assignments manager" },
          { id: "study-planner", label: "AI Study Planner" },
          { id: "report-cards", label: "Report Cards" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 rounded-t-lg transition-all ${
              activeTab === tab.id
                ? "border-[#12274E] text-[#12274E] bg-primary/5"
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
              <div className="flex gap-2 overflow-x-auto pb-1.5 w-full sm:w-auto max-w-full scrollbar-none shrink-0">
                {["", "low", "medium", "high", "critical"].map((risk) => (
                  <button
                    key={risk}
                    onClick={() => setRiskFilter(risk)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold capitalize transition-all shrink-0 ${
                      riskFilter === risk
                        ? "bg-[#12274E] border-[#12274E] text-white"
                        : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-slate-50"
                    }`}
                  >
                    {risk || "All Risk Levels"}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <LoadingState label="Loading students…" />
            ) : studentsError ? (
              <ErrorState message={studentsError} onRetry={() => fetchStudents()} />
            ) : students.length === 0 ? (
              <p className="text-sm text-center py-10 text-[#5f6368] italic">No matching student records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-[#dadce0] text-[#5f6368] font-medium">
                      <th className="py-3 px-4 whitespace-nowrap">Roll No</th>
                      <th className="py-3 px-4 whitespace-nowrap">Name</th>
                      <th className="py-3 px-4 whitespace-nowrap">Class</th>
                      <th className="py-3 px-4 whitespace-nowrap">Attendance</th>
                      <th className="py-3 px-4 whitespace-nowrap">Risk Status</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-semibold whitespace-nowrap">#{s.rollNo}</td>
                        <td className="py-3 px-4 font-semibold text-[#202124] whitespace-nowrap">{s.name}</td>
                        <td className="py-3 px-4 text-[#5f6368] whitespace-nowrap">{s.class}</td>
                        <td className="py-3 px-4 text-[#5f6368] whitespace-nowrap">{s.attendance != null ? `${s.attendance}%` : "N/A"}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
                            s.riskLevel === "low" ? "bg-green-50 text-green-700" :
                            s.riskLevel === "medium" ? "bg-amber-50 text-amber-700" :
                            s.riskLevel === "high" ? "bg-orange-50 text-orange-700" : "bg-red-50 text-red-700"
                          }`}>
                            {s.riskLevel}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => navigate(`/students/${s._id}`)}
                            className="text-[#12274E] hover:underline font-semibold text-xs whitespace-nowrap"
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
            {pendingLoading ? (
              <LoadingState label="Loading pending enrollments…" compact />
            ) : pendingError ? (
              <ErrorState message={pendingError} onRetry={fetchPendingStudents} compact />
            ) : pendingStudents.length === 0 ? (
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
                            disabled={!!approvingId}
                            className="bg-[#12274E] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#0B1830] transition-colors"
                          >
                            {approvingId === s._id ? "Updating…" : "Approve"}
                          </button>
                          <button
                            onClick={() => handleApproveStudent(s._id, false)}
                            disabled={!!approvingId}
                            className="bg-white border border-[#dadce0] text-[#d93025] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-50 transition-colors"
                          >
                            {approvingId === s._id ? "Updating…" : "Reject"}
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
                <button type="submit" disabled={creatingAssignment} className="w-full bg-[#12274E] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#0B1830] transition-colors">
                  {creatingAssignment ? "Publishing…" : "Publish Assignment Link"}
                </button>
              </form>
            </div>

            {/* List & Grade Submissions */}
            <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm flex flex-col gap-6">
              <div>
                <h2 className="text-lg font-semibold text-[#202124] mb-3">Evaluate Submissions</h2>
                {assignmentsLoading ? (
                  <LoadingState label="Loading assignments…" compact />
                ) : assignmentsError ? (
                  <ErrorState message={assignmentsError} onRetry={fetchAssignments} compact />
                ) : assignments.length === 0 ? (
                  <p className="text-xs text-[#5f6368] italic">No assignments active.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {assignments.map((a) => (
                      <button
                        key={a._id}
                        onClick={() => fetchSubmissions(a._id!)}
                        className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition-all ${
                          selectedAsgnId === a._id
                            ? "bg-primary/5 border-[#12274E] text-[#12274E]"
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
                  {loadingSubmissions ? <LoadingState label="Loading submissions…" compact /> : submissions.length === 0 ? (
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
                              className="text-primary hover:underline font-bold"
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
                              <button type="submit" disabled={grading} className="bg-[#12274E] text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-[#0B1830]">
                                {grading ? "Submitting…" : "Submit Score"}
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
                  className="w-full bg-[#12274E] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#0B1830] disabled:bg-slate-300 transition-colors"
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
                      disabled={sendingPlan}
                      className="bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-800 transition-colors"
                    >
                      {sendingPlan ? "Delivering…" : "Deliver Plan to Student Profile"}
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

        {/* TAB 5: REPORT CARDS */}
        {activeTab === "report-cards" && (
          <div className="space-y-6">
            {/* Generate Card */}
            <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-[#202124] mb-1">Generate Student Report Card</h3>
              <p className="text-[10px] text-[#5f6368] mb-4">Select a student to generate a printable academic report card in the CBSE format.</p>

              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={rcStudentId}
                  onChange={(e) => {
                    setRcStudentId(e.target.value);
                    if (e.target.value) {
                      setRcLoadingJobs(true); setRcJobsError("");
                      axios.get(`/api/students/${e.target.value}/report-card/jobs`)
                        .then(res => { if (res.data.success) setRcJobs(res.data.data); })
                        .catch((error) => { console.error(error); setRcJobsError("Failed to load report card history."); })
                        .finally(() => setRcLoadingJobs(false));
                    } else {
                      setRcJobs([]);
                      setRcJobsError("");
                    }
                  }}
                  className="flex-1 rounded-lg border border-[#dadce0] px-3 py-2.5 text-xs focus:border-[#12274E] focus:outline-hidden bg-white font-medium"
                >
                  <option value="">Select a student...</option>
                  {students.map(s => (
                    <option key={s._id} value={s._id}>{s.name} — #{s.rollNo} ({s.class})</option>
                  ))}
                </select>
                <button
                  disabled={!rcStudentId || rcGenerating}
                  onClick={async () => {
                    if (!rcStudentId) return;
                    setRcGenerating(true);
                    try {
                      const res = await axios.post(`/api/students/${rcStudentId}/report-card/generate`);
                      if (res.data.success) {
                        toast.success("Report card generation queued!");
                        // Poll for completion
                        const jobId = res.data.jobId;
                        const poll = setInterval(async () => {
                          try {
                            const jr = await axios.get(`/api/students/report-card/jobs/${jobId}`);
                            if (jr.data.data.status === "completed" || jr.data.data.status === "failed") {
                              clearInterval(poll);
                              if (jr.data.data.status === "completed") {
                                toast.success("Report card ready for download!");
                              } else {
                                toast.error("Report card generation failed.");
                              }
                              // Refresh jobs list
                              const lr = await axios.get(`/api/students/${rcStudentId}/report-card/jobs`);
                              if (lr.data.success) setRcJobs(lr.data.data);
                            }
                          } catch { clearInterval(poll); }
                        }, 3000);
                      }
                    } catch {
                      toast.error("Failed to queue report card generation.");
                    } finally {
                      setRcGenerating(false);
                    }
                  }}
                  className="px-5 py-2.5 bg-[#12274E] text-white rounded-lg text-xs font-bold hover:bg-[#0B1830] disabled:bg-slate-300 transition-colors flex items-center gap-2"
                >
                  {rcGenerating ? (
                    <><svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Generating...</>
                  ) : (
                    <><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Generate Report Card</>
                  )}
                </button>
              </div>
            </div>

            {/* Jobs History */}
            {rcStudentId && (
              <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-[#202124] mb-4">Report Card History</h3>
                {rcLoadingJobs ? (
                  <LoadingState label="Loading report card history…" compact />
                ) : rcJobsError ? (
                  <ErrorState message={rcJobsError} compact />
                ) : rcJobs.length === 0 ? (
                  <p className="text-xs text-[#5f6368] italic text-center py-8">No report cards generated for this student yet.</p>
                ) : (
                  <div className="space-y-3">
                    {rcJobs.map((job) => (
                      <div key={job._id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                        job.status === "completed" ? "bg-emerald-50/50 border-emerald-100" :
                        job.status === "failed" ? "bg-red-50/50 border-red-100" :
                        job.status === "processing" ? "bg-amber-50/50 border-amber-100" :
                        "bg-primary/5 border-primary/15"
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                            job.status === "completed" ? "bg-emerald-100" :
                            job.status === "failed" ? "bg-red-100" :
                            "bg-amber-100"
                          }`}>
                            {job.status === "completed" ? (
                              <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                            ) : job.status === "failed" ? (
                              <svg className="h-4 w-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            ) : (
                              <svg className="h-4 w-4 text-amber-600 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            )}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">Report Card — {job.studentName}</span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(job.createdAt).toLocaleDateString()} at {new Date(job.createdAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                              {" · "}
                              <span className={`font-bold uppercase ${
                                job.status === "completed" ? "text-emerald-600" :
                                job.status === "failed" ? "text-red-600" :
                                "text-amber-600"
                              }`}>{job.status}</span>
                            </span>
                          </div>
                        </div>
                        {job.status === "completed" && job.outputFile && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  const result = await downloadFile(`/api/students/report-card/download/${job._id}/pdf`, `Report-Card-${job.studentName.replace(/\s+/g, "-")}-${new Date(job.createdAt).toISOString().slice(0,10)}.pdf`, "application/pdf");
                                  toast.success(result === "started" ? "Downloading PDF to Downloads." : "PDF report card downloaded!");
                                } catch {
                                  toast.error("Failed to download PDF report card.");
                                }
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 border border-emerald-600 rounded-lg text-[10px] font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              PDF
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const result = await downloadFile(job.outputFile, `Report-Card-${job.studentName.replace(/\s+/g, "-")}-${new Date(job.createdAt).toISOString().slice(0,10)}.html`, "text/html");
                                  toast.success(result === "started" ? "Downloading HTML to Downloads." : "HTML report card downloaded!");
                                } catch {
                                  toast.error("Failed to download HTML report card.");
                                }
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 transition-colors shadow-sm cursor-pointer"
                            >
                              HTML
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Grading Scale Reference */}
            <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-[#202124] mb-3">Grading Scale Reference</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-2 font-bold text-slate-600 text-left border-b border-slate-200">Marks Range</th>
                      <th className="px-4 py-2 font-bold text-slate-600 text-left border-b border-slate-200">Grade</th>
                      <th className="px-4 py-2 font-bold text-slate-600 text-left border-b border-slate-200">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { range: "91 – 100", grade: "A1", remark: "Outstanding", color: "text-emerald-700 bg-emerald-50" },
                      { range: "81 – 90", grade: "A2", remark: "Excellent", color: "text-emerald-600 bg-emerald-50/50" },
                      { range: "71 – 80", grade: "B1", remark: "Very Good", color: "text-primary bg-primary/5" },
                      { range: "61 – 70", grade: "B2", remark: "Good", color: "text-primary bg-primary/5" },
                      { range: "51 – 60", grade: "C1", remark: "Average", color: "text-amber-700 bg-amber-50" },
                      { range: "41 – 50", grade: "C2", remark: "Below Average", color: "text-amber-600 bg-amber-50/50" },
                      { range: "33 – 40", grade: "D", remark: "Pass", color: "text-orange-700 bg-orange-50" },
                      { range: "Below 33", grade: "E", remark: "Needs Improvement", color: "text-red-700 bg-red-50" },
                    ].map((r) => (
                      <tr key={r.grade} className={`border-b border-slate-100 ${r.color}`}>
                        <td className="px-4 py-2 font-semibold">{r.range}</td>
                        <td className="px-4 py-2 font-black">{r.grade}</td>
                        <td className="px-4 py-2">{r.remark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
