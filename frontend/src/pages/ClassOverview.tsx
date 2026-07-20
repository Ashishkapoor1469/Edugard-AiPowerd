import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.js";

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
  marks?: SubjectMarks[];
}

interface ClassTest {
  marks: number;
  maxMarks: number;
}

interface ExamMarks {
  marks: number | null;
  maxMarks: number;
}

interface SubjectMarks {
  subjectName: string;
  classTests?: ClassTest[];
  midTerm?: ExamMarks;
  houseExam?: ExamMarks;
}

const ClassOverview: React.FC = () => {
  const { className } = useParams<{ className: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Active class state
  const [activeClass, setActiveClass] = useState(className || "BCA-A");

  // Primary states
  const [students, setStudents] = useState<Student[]>([]);
  const [classStats, setClassStats] = useState<any>(null);
  const [subjectAverages, setSubjectAverages] = useState<Record<string, number>>({});
  const [aiSummary, setAiSummary] = useState("");

  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  const loadingMessages = [
    `Analyzing ${activeClass} class performance...`,
    "Building class detailed report...",
    "Calculating subject averages...",
    "Reviewing student risk distribution...",
    "Preparing cohort roster...",
  ];

  const calculateSubjectAverage = (subject: SubjectMarks) => {
    let obtained = 0;
    let maximum = 0;

    for (const test of subject.classTests || []) {
      obtained += Number(test.marks || 0);
      maximum += Number(test.maxMarks || 0);
    }

    if (subject.midTerm?.marks !== null && subject.midTerm?.marks !== undefined) {
      obtained += Number(subject.midTerm.marks || 0);
      maximum += Number(subject.midTerm.maxMarks || 0);
    }

    if (subject.houseExam?.marks !== null && subject.houseExam?.marks !== undefined) {
      obtained += Number(subject.houseExam.marks || 0);
      maximum += Number(subject.houseExam.maxMarks || 0);
    }

    return maximum > 0 ? (obtained / maximum) * 100 : null;
  };

  const buildClassAnalytics = (classStudents: Student[], analyticsClass = activeClass) => {
    const attendanceValues = classStudents
      .map((student) => student.attendance)
      .filter((attendance): attendance is number => attendance !== null && attendance !== undefined);

    const subjectSums: Record<string, number> = {};
    const subjectCounts: Record<string, number> = {};

    for (const student of classStudents) {
      for (const subject of student.marks || []) {
        const average = calculateSubjectAverage(subject);
        if (average === null) continue;

        subjectSums[subject.subjectName] = (subjectSums[subject.subjectName] || 0) + average;
        subjectCounts[subject.subjectName] = (subjectCounts[subject.subjectName] || 0) + 1;
      }
    }

    const nextSubjectAverages: Record<string, number> = {};
    for (const subjectName of Object.keys(subjectSums)) {
      nextSubjectAverages[subjectName] = subjectSums[subjectName] / subjectCounts[subjectName];
    }

    const subjectAverageValues = Object.values(nextSubjectAverages);

    return {
      stats: {
        className: analyticsClass,
        totalStudents: classStudents.length,
        avgAttendance: attendanceValues.length
          ? attendanceValues.reduce((sum, attendance) => sum + attendance, 0) / attendanceValues.length
          : 0,
        avgMarks: subjectAverageValues.length
          ? subjectAverageValues.reduce((sum, average) => sum + average, 0) / subjectAverageValues.length
          : 0,
        atRiskCount: classStudents.filter((student) => student.riskLevel === "high" || student.riskLevel === "critical").length,
        failingSubjects: Object.keys(nextSubjectAverages).filter((subjectName) => nextSubjectAverages[subjectName] < 50),
      },
      subjectAverages: nextSubjectAverages,
    };
  };

  // Class list options (authorized classes if mentor, or all if admin)
  const classTabs = user?.role === "admin" 
    ? ["BCA-A", "BCA-B", "BBA-A", "BBA-B", "BTECH-A"]
    : user?.assignedClasses?.length ? user.assignedClasses : ["BCA-A"];

  const fetchClassDetails = async () => {
    const requestedClass = activeClass;
    const cacheKey = `class_data_${requestedClass}`;
    const cachedDataStr = sessionStorage.getItem(cacheKey);
    if (cachedDataStr) {
      try {
        const cached = JSON.parse(cachedDataStr);
        setClassStats(cached.stats);
        setSubjectAverages(cached.subjectAverages);
        setAiSummary(cached.aiSummary || "");
        setStudents(cached.students);
        setLoading(false);

        if (cached.aiSummary) {
          setGeneratingSummary(false);
          return;
        }
      } catch (e) {
        console.error("Failed to parse cached class data", e);
      }
    } else {
      setLoading(true);
      setClassStats(null); // clear old stats
      setSubjectAverages({}); // clear old averages
      setStudents([]); // clear old students roster
      setAiSummary(""); // clear old AI summary
      try {
        const studentsRes = await axios.get("/api/students", {
          params: { class: requestedClass, limit: 50 },
        });

        if (studentsRes.data.success) {
          const fetchedStudents: Student[] = studentsRes.data.data;
          const analytics = buildClassAnalytics(fetchedStudents, requestedClass);
          setStudents(fetchedStudents);
          setClassStats(analytics.stats);
          setSubjectAverages(analytics.subjectAverages);

          sessionStorage.setItem(cacheKey, JSON.stringify({
            stats: analytics.stats,
            subjectAverages: analytics.subjectAverages,
            aiSummary: "",
            students: fetchedStudents,
          }));
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.response?.data?.message || "Failed to load class analytics");
        setGeneratingSummary(false);
        return;
      } finally {
        setLoading(false);
      }
    }

    setGeneratingSummary(true);
    try {
      const res = await axios.get(`/api/students/class/${requestedClass}/summary`);
      if (res.data.success) {
        const stats = res.data.data.stats;
        const subAvgs = res.data.data.subjectAverages;
        const summary = res.data.data.summary;
        const cachedStudents = JSON.parse(sessionStorage.getItem(cacheKey) || "{}").students || [];

        setClassStats(stats);
        setSubjectAverages(subAvgs);
        setAiSummary(summary);

        sessionStorage.setItem(cacheKey, JSON.stringify({
          stats,
          subjectAverages: subAvgs,
          aiSummary: summary,
          students: cachedStudents,
        }));
      }
    } catch (err) {
      console.error("Failed to load AI class summary", err);
    } finally {
      setGeneratingSummary(false);
    }
  };

  useEffect(() => {
    fetchClassDetails();
  }, [activeClass]);

  useEffect(() => {
    if (!loading) {
      setLoadingMessageIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingMessageIndex((current) => (current + 1) % loadingMessages.length);
    }, 1800);

    return () => window.clearInterval(timer);
  }, [loading, loadingMessages.length]);

  // Sync activeClass state with URL param when URL changes
  useEffect(() => {
    if (className && className !== activeClass) {
      const cacheKey = `class_data_${className}`;
      const cachedDataStr = sessionStorage.getItem(cacheKey);
      if (cachedDataStr) {
        try {
          const cached = JSON.parse(cachedDataStr);
          setClassStats(cached.stats);
          setSubjectAverages(cached.subjectAverages);
          setAiSummary(cached.aiSummary);
          setStudents(cached.students);
          setLoading(false);
        } catch (e) {
          console.error(e);
        }
      } else {
        setLoading(true);
        setClassStats(null);
        setSubjectAverages({});
        setStudents([]);
        setAiSummary("");
      }
      setActiveClass(className);
    }
  }, [className]);

  // Request fresh Class AI Summary
  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const res = await axios.get(`/api/students/class/${activeClass}/summary`);
      if (res.data.success) {
        const summary = res.data.data.summary;
        setAiSummary(summary);
        toast.success("AI class performance review completed!");

        // Update cache with new AI summary
        const cacheKey = `class_data_${activeClass}`;
        const cachedDataStr = sessionStorage.getItem(cacheKey);
        if (cachedDataStr) {
          const cached = JSON.parse(cachedDataStr);
          cached.aiSummary = summary;
          sessionStorage.setItem(cacheKey, JSON.stringify(cached));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate AI class review");
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Recharts donut configuration
  const donutData = classStats
    ? [
        { name: "Low Risk", value: students.filter((s) => s.riskLevel === "low").length, color: "#10B981" },
        { name: "Medium Risk", value: students.filter((s) => s.riskLevel === "medium").length, color: "#F59E0B" },
        { name: "High/Critical", value: students.filter((s) => s.riskLevel === "high" || s.riskLevel === "critical").length, color: "#EF4444" },
      ]
    : [];



  if (loading && !classStats) {
    return (
      <div className="flex-1 space-y-6 bg-bg-base p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 text-primary">
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-text-primary">{loadingMessages[loadingMessageIndex]}</h1>
              <p className="mt-1 text-xs font-medium text-secondary">This may take a moment while EduGuard prepares class analytics.</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
          {[1, 2, 3, 4].map(n => <div key={n} className="h-28 animate-pulse rounded-xl bg-slate-200" />)}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="h-80 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-80 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="main-content flex-1 overflow-y-auto bg-bg-base p-4 md:p-6">
      {/* Page Header & Class Tabs */}
      <div className="mb-6 flex flex-col justify-between sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">{activeClass} Class Overview</h1>
          <p className="text-xs text-secondary font-medium mt-0.5">Aggregate performance and subject metrics</p>
        </div>
        
        {/* Export Button */}
        <button
          onClick={() => toast.success("Exporting class roster sheet...")}
          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-secondary hover:bg-slate-50 transition-all sm:mt-0 shadow-xs"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Report
        </button>
      </div>

      {/* Class tabs selection */}
      <div className="mb-6 border-b border-slate-200">
        <div className="flex gap-2 -mb-px">
          {classTabs.map((c) => (
            <button
              key={c}
              onClick={() => {
                const cacheKey = `class_data_${c}`;
                const cachedDataStr = sessionStorage.getItem(cacheKey);
                if (cachedDataStr) {
                  try {
                    const cached = JSON.parse(cachedDataStr);
                    setClassStats(cached.stats);
                    setSubjectAverages(cached.subjectAverages);
                    setAiSummary(cached.aiSummary);
                    setStudents(cached.students);
                    setLoading(false);
                  } catch (e) {
                    console.error(e);
                  }
                } else {
                  setLoading(true);
                  setClassStats(null);
                  setSubjectAverages({});
                  setStudents([]);
                  setAiSummary("");
                }
                setActiveClass(c);
                navigate(`/class/${c}`);
              }}
              className={`border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
                activeClass === c
                  ? "border-primary text-primary"
                  : "border-transparent text-secondary hover:border-slate-300 hover:text-text-primary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: Metrics */}
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Students */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-wide">Total Class Strength</span>
          <p className="mt-2 text-3xl font-extrabold text-text-primary">{classStats?.totalStudents || 0}</p>
          <span className="mt-1 block text-[9px] font-bold text-slate-400">Registered cohort students</span>
        </div>

        {/* Avg Attendance */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-wide">Avg Class Attendance</span>
          <p className="mt-2 text-3xl font-extrabold text-text-primary">
            {classStats?.avgAttendance ? `${classStats.avgAttendance.toFixed(1)}%` : "0%"}
          </p>
          <span className="mt-1 block text-[9px] font-bold text-slate-400">Classroom presence index</span>
        </div>

        {/* Avg Marks */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-wide">Avg Performance Score</span>
          <p className="mt-2 text-3xl font-extrabold text-text-primary">
            {classStats?.avgMarks ? `${classStats.avgMarks.toFixed(1)}%` : "0%"}
          </p>
          <span className="mt-1 block text-[9px] font-bold text-slate-400">GPA aggregate of cohort</span>
        </div>

        {/* At Risk */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-wide">Cohort At Risk</span>
          <p className={`mt-2 text-3xl font-extrabold ${classStats?.atRiskCount > 0 ? "text-critical" : "text-low"}`}>
            {classStats?.atRiskCount || 0}
          </p>
          <span className={`mt-1 block text-[9px] font-semibold ${classStats?.atRiskCount > 0 ? "text-critical" : "text-low"}`}>
            {classStats?.atRiskCount > 0 ? "Faculty follow-up needed" : "Low cohort concern"}
          </span>
        </div>
      </div>

      {/* Row 2: Analytics & AI Summary */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Subject wise average marks horizontal list */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-primary">Subject-wise Average Marks</h2>
            <p className="text-[11px] font-medium text-secondary">Class-wide averages per subject</p>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {Object.keys(subjectAverages).length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-10">No subject marks data uploaded</p>
            ) : (
              Object.keys(subjectAverages).map((subName) => {
                const avg = subjectAverages[subName];
                const isFailing = avg < 50;

                return (
                  <div key={subName} className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className={`font-semibold ${isFailing ? "text-critical" : "text-text-primary"}`}>
                        {subName}
                      </span>
                      <span className={`font-bold ${isFailing ? "text-critical" : "text-primary"}`}>
                        {avg.toFixed(1)}%
                      </span>
                    </div>
                    {/* Horizontal Progress bar */}
                    <div className="h-2 bg-slate-100 rounded-full w-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isFailing ? "bg-critical" : "bg-primary"}`}
                        style={{ width: `${avg}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right side: Donut distribution & AI Class Summary */}
        <div className="flex flex-col gap-6">
          {/* Donut chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-text-primary">Class Risk Distribution</h2>
            <div className="flex h-36 items-center justify-center">
              {students.length > 0 ? (
                <>
                  <div className="h-28 w-28 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={45}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {donutData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legend */}
                  <div className="ml-6 flex flex-col gap-1 text-[11px] font-semibold">
                    {donutData.map((item) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-text-primary">{item.name}:</span>
                        <span className="text-secondary">{item.value} students</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400">No students loaded.</p>
              )}
            </div>
          </div>

          {/* AI class summary card */}
          <div className="flex-1 rounded-xl border border-primary/15 bg-white p-6 shadow-xs border-l-4 border-l-primary relative">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                <svg className="h-4.5 w-4.5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 21h6v-1a6 6 0 00-6-6V9a2 2 0 114 0v1h2V9a4 4 0 00-8 0v6a6 6 0 00-6 6v1h6v-1z" />
                </svg>
                AI Class Summary Review
              </span>
              <span className="rounded-md bg-primary/5 px-1.5 py-0.5 text-[8px] font-bold text-primary uppercase">NVIDIA NIM</span>
            </div>

            {generatingSummary ? (
              <div className="space-y-2 mt-4 animate-pulse">
                <div className="h-3.5 w-full rounded bg-slate-100" />
                <div className="h-3.5 w-11/12 rounded bg-slate-100" />
                <div className="h-3.5 w-4/5 rounded bg-slate-100" />
              </div>
            ) : aiSummary ? (
              <p className="text-xs text-text-primary leading-relaxed italic mt-3">
                &ldquo;{aiSummary}&rdquo;
              </p>
            ) : (
              <div className="mt-4 flex flex-col items-center">
                <p className="text-center text-xs text-slate-400">Generate an AI-driven academic analysis paragraph summarizing class bottlenecks.</p>
                <button
                  onClick={handleGenerateSummary}
                  className="mt-3 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-white hover:bg-primary-hover shadow-xs focus:outline-hidden"
                >
                  Generate Summary
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Class Student List Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="mb-4 text-sm font-bold text-text-primary">Cohort Performance Details</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-secondary uppercase tracking-wider bg-slate-50/50">
                <th className="py-2.5 px-3">Roll No</th>
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Attendance</th>
                <th className="py-2.5 px-3">Risk Level</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-xs text-slate-400">No student records in this class</td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr
                    key={student._id}
                    onClick={() => navigate(`/students/${student._id}`)}
                    className="border-b border-slate-100 hover:bg-primary/5 cursor-pointer text-xs"
                  >
                    <td className="py-3 px-3 font-bold text-text-primary">#{student.rollNo}</td>
                    <td className="py-3 px-3 font-semibold text-text-primary">{student.name}</td>
                    <td className="py-3 px-3">
                      {student.attendance !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                student.attendance < 75 ? "bg-critical" : "bg-low"
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
                    <td className="py-3 px-3">
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
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/students/${student._id}`);
                        }}
                        className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1 text-[10px] font-bold text-secondary hover:text-primary transition-all"
                      >
                        Profile
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClassOverview;
