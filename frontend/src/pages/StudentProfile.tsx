import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import axios from "axios";
import socket from "../utils/socket.js";
import toast from "react-hot-toast";

interface ClassTest {
  testNumber: number;
  marks: number;
  maxMarks: number;
}

interface ExamMarks {
  marks: number | null;
  maxMarks: number;
}

interface SubjectMarks {
  subjectName: string;
  isPractical: boolean;
  classTests: ClassTest[];
  midTerm: ExamMarks;
  houseExam: ExamMarks;
}

interface Student {
  _id: string;
  rollNo: string;
  name: string;
  email?: string;
  course: string;
  class: string;
  semester: number;
  attendance: number | null;
  marks: SubjectMarks[];
  behavior: "excellent" | "good" | "average" | "bad" | null;
  contribution: string[];
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskExplanation: string;
  aiImprovementPlan: string;
  mentorId?: {
    _id: string;
    name: string;
    email: string;
    isOnline: boolean;
  };
}

const StudentProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const studentId = id || user?.id;

  // Primary states
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states (Missing Data / overrides form)
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [formAttendance, setFormAttendance] = useState("");
  const [formBehavior, setFormBehavior] = useState("");
  const [formContributions, setFormContributions] = useState("");
  const [formMarks, setFormMarks] = useState<Record<string, {
    test1: string; test1Max: string;
    test2: string; test2Max: string;
    test3: string; test3Max: string;
    midTerm: string; midTermMax: string;
    houseExam: string; houseExamMax: string;
  }>>({});

  // AI states
  const [generatingExplanation, setGeneratingExplanation] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // Mentor Selection states (for student role)
  const [mentorsList, setMentorsList] = useState<any[]>([]);
  const [selectedMentor, setSelectedMentor] = useState("");
  const [loadingMentors, setLoadingMentors] = useState(false);

  // Chat states
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch mentors list
  const fetchMentorsList = async () => {
    setLoadingMentors(true);
    try {
      const res = await axios.get("/api/mentors/list");
      if (res.data.success) {
        setMentorsList(res.data.data);
      }
    } catch (err) {
      console.error("Failed to load mentors list:", err);
    } finally {
      setLoadingMentors(false);
    }
  };

  // Fetch student profile details
  const fetchStudent = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await axios.get(`/api/students/${studentId}`);
      if (res.data.success) {
        const data = res.data.data;
        setStudent(data);
        // Pre-fill form fields
        setFormAttendance(data.attendance !== null ? String(data.attendance) : "");
        setFormBehavior(data.behavior || "");
        setFormContributions(data.contribution.join(", "));

        // Pre-fill marks inputs
        const marksInit: typeof formMarks = {};
        for (const sub of data.marks) {
          const t1 = sub.classTests.find((t) => t.testNumber === 1);
          const t2 = sub.classTests.find((t) => t.testNumber === 2);
          const t3 = sub.classTests.find((t) => t.testNumber === 3);

          marksInit[sub.subjectName] = {
            test1: t1 ? String(t1.marks) : "",
            test1Max: t1 ? String(t1.maxMarks) : "25",
            test2: t2 ? String(t2.marks) : "",
            test2Max: t2 ? String(t2.maxMarks) : "25",
            test3: t3 ? String(t3.marks) : "",
            test3Max: t3 ? String(t3.maxMarks) : "25",
            midTerm: sub.midTerm.marks !== null ? String(sub.midTerm.marks) : "",
            midTermMax: String(sub.midTerm.maxMarks || 100),
            houseExam: sub.houseExam.marks !== null ? String(sub.houseExam.marks) : "",
            houseExamMax: String(sub.houseExam.maxMarks || 100),
          };
        }
        setFormMarks(marksInit);

        // Fetch mentors list if student has no mentor and role is student
        if (!data.mentorId && user?.role === "student") {
          fetchMentorsList();
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load student details");
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  // Fetch chat history
  const fetchChatHistory = async () => {
    try {
      const res = await axios.get(`/api/chat/${studentId}`);
      if (res.data.success) {
        setMessages(res.data.data);
      }
    } catch (err) {
      console.error("Failed to load message history:", err);
    }
  };

  useEffect(() => {
    if (studentId) {
      fetchStudent();
      fetchChatHistory();
    }
  }, [studentId]);

  // Connect to socket and join room for this student
  useEffect(() => {
    if (student) {
      socket.connect();
      socket.emit("joinRoom", student._id);

      socket.on("newMessage", (msg: any) => {
        if (msg.studentId === student._id) {
          setMessages((prev) => [...prev, msg]);
        }
      });

      socket.on("typing", (data: { sender: string; isTyping: boolean }) => {
        if (data.sender === "ai") {
          setAiTyping(data.isTyping);
        }
      });
    }

    return () => {
      socket.off("newMessage");
      socket.off("typing");
    };
  }, [student]);

  // Scroll chat window to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiTyping]);

  // Generate Lazy AI Explanation
  const handleGenerateExplanation = async () => {
    setGeneratingExplanation(true);
    try {
      const res = await axios.get(`/api/students/${studentId}/explanation`);
      if (res.data.success && student) {
        setStudent({ ...student, riskExplanation: res.data.data });
        toast.success("AI risk analysis completed!");
      }
    } catch (err) {
      console.error(err);
      toast.error("AI risk generation failed");
    } finally {
      setGeneratingExplanation(false);
    }
  };

  // Generate Lazy AI Improvement Plan
  const handleGeneratePlan = async () => {
    setGeneratingPlan(true);
    try {
      const res = await axios.get(`/api/students/${studentId}/improvement`);
      if (res.data.success && student) {
        setStudent({ ...student, aiImprovementPlan: res.data.data });
        toast.success("AI academic recovery plan ready!");
      }
    } catch (err) {
      console.error(err);
      toast.error("AI plan generation failed");
    } finally {
      setGeneratingPlan(false);
    }
  };

  // Select Mentor (Join Group)
  const handleJoinGroup = async () => {
    if (!selectedMentor) {
      toast.error("Please select a mentor");
      return;
    }
    const toastId = toast.loading("Joining mentor group...");
    try {
      const res = await axios.patch("/api/students/select-mentor", { mentorId: selectedMentor });
      if (res.data.success) {
        toast.success("Successfully joined mentor group!", { id: toastId });
        fetchStudent(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to join mentor group", { id: toastId });
    }
  };

  // Handle Chat message submit
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !student || !user) return;

    const sender = user.role === "student" ? "student" : "mentor";

    const payload = {
      roomId: student._id,
      studentId: student._id,
      mentorId: student.mentorId?._id || user.id,
      sender,
      text: chatInput.trim(),
    };

    socket.emit("sendMessage", payload);
    setChatInput("");
  };

  // Handle Form changes and submit
  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;

    const toastId = toast.loading("Updating records and recalculating risk...");

    // Format Marks for backend
    const updatedMarks: SubjectMarks[] = student.marks.map((sub) => {
      const inputs = formMarks[sub.subjectName] || {
        test1: "", test1Max: "25",
        test2: "", test2Max: "25",
        test3: "", test3Max: "25",
        midTerm: "", midTermMax: "100",
        houseExam: "", houseExamMax: "100",
      };

      const classTests: ClassTest[] = [];
      if (inputs.test1) classTests.push({ testNumber: 1, marks: Number(inputs.test1), maxMarks: Number(inputs.test1Max) });
      if (inputs.test2) classTests.push({ testNumber: 2, marks: Number(inputs.test2), maxMarks: Number(inputs.test2Max) });
      if (inputs.test3) classTests.push({ testNumber: 3, marks: Number(inputs.test3), maxMarks: Number(inputs.test3Max) });

      return {
        subjectName: sub.subjectName,
        isPractical: sub.isPractical,
        classTests,
        midTerm: {
          marks: inputs.midTerm ? Number(inputs.midTerm) : null,
          maxMarks: Number(inputs.midTermMax),
        },
        houseExam: {
          marks: inputs.houseExam ? Number(inputs.houseExam) : null,
          maxMarks: Number(inputs.houseExamMax),
        },
      };
    });

    const payload = {
      attendance: formAttendance !== "" ? Number(formAttendance) : null,
      behavior: formBehavior || null,
      contribution: formContributions
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      marks: updatedMarks,
    };

    try {
      const res = await axios.patch(`/api/students/${id}`, payload);
      if (res.data.success) {
        toast.success("Roster record updated successfully", { id: toastId });
        setShowOverrideForm(false);
        fetchStudent(false); // reload data without resetting loading skeletons
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update overrides", { id: toastId });
    }
  };

  // Helper to calculate subject average
  const getSubjectAverage = (sub: SubjectMarks) => {
    const percentages: number[] = [];
    if (sub.classTests.length > 0) {
      let sum = 0, max = 0;
      for (const t of sub.classTests) {
        sum += t.marks;
        max += t.maxMarks;
      }
      if (max > 0) percentages.push((sum / max) * 100);
    }
    if (sub.midTerm.marks !== null && sub.midTerm.maxMarks > 0) {
      percentages.push((sub.midTerm.marks / sub.midTerm.maxMarks) * 100);
    }
    if (sub.houseExam.marks !== null && sub.houseExam.maxMarks > 0) {
      percentages.push((sub.houseExam.marks / sub.houseExam.maxMarks) * 100);
    }
    if (percentages.length === 0) return null;
    return percentages.reduce((a, b) => a + b, 0) / percentages.length;
  };

  // Colors based on risk level
  const getRiskColors = (level: string) => {
    switch (level) {
      case "low": return { text: "text-low", bg: "bg-emerald-50", stroke: "#10B981" };
      case "medium": return { text: "text-medium", bg: "bg-amber-50", stroke: "#F59E0B" };
      case "high": return { text: "text-high", bg: "bg-orange-50", stroke: "#F97316" };
      case "critical": return { text: "text-critical", bg: "bg-red-50", stroke: "#EF4444" };
      default: return { text: "text-secondary", bg: "bg-slate-50", stroke: "#64748B" };
    }
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-6 bg-bg-base p-6">
        <div className="h-6 w-32 animate-pulse rounded-md bg-slate-200" />
        <div className="h-44 w-full animate-pulse rounded-xl bg-slate-200" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="h-96 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-96 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex-1 bg-bg-base p-6 text-center text-secondary">
        Student profile not found.
      </div>
    );
  }

  const riskColors = getRiskColors(student.riskLevel);
  const totalCircumference = 2 * Math.PI * 40; // R=40
  const riskPercentOffset = totalCircumference - (student.riskScore / 100) * totalCircumference;

  return (
    <div className="flex-1 overflow-y-auto bg-bg-base p-6">
      {/* Back Button (Mentors/Admins only) */}
      {user?.role !== "student" && (
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1.5 text-xs font-bold text-secondary hover:text-primary transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </button>
      )}

      {/* Header Card */}
      <div className="mb-6 flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 md:flex-row md:items-center md:justify-between shadow-xs">
        {/* Left side details */}
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-xl font-extrabold text-primary shadow-xs">
            {student.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-text-primary">{student.name}</h1>
              {student.riskLevel === "critical" && (
                <span className="flex h-2.5 w-2.5 rounded-full bg-critical animate-pulse" />
              )}
            </div>
            <p className="text-xs font-bold text-secondary mt-1">
              Roll No: #{student.rollNo} · {student.course} · {student.class} · Semester {student.semester}
            </p>
            <span className="inline-flex items-center rounded-md bg-indigo-50/50 px-2 py-0.5 text-[9px] font-bold text-primary mt-2">
              Assigned Mentor: {student.mentorId?.name || "Unassigned"}
            </span>
          </div>
        </div>

        {/* Right side Speedometer circle dial gauge */}
        <div className="flex items-center gap-4 border-t border-slate-100 pt-4 md:border-t-0 md:pt-0">
          <div className="relative h-24 w-24">
            <svg className="h-full w-full -rotate-95" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke={riskColors.stroke}
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={totalCircumference}
                strokeDashoffset={riskPercentOffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black text-text-primary leading-4">{student.riskScore}</span>
              <span className="text-[8px] font-bold text-slate-400">/ 100</span>
            </div>
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Risk Probability Index</span>
            <span className={`text-base font-extrabold capitalize ${riskColors.text}`}>{student.riskLevel} Risk</span>
          </div>
        </div>
      </div>

      {/* Mentor Selection Card for Students without Mentor */}
      {!student.mentorId && user?.role === "student" && (
        <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/30 p-6 shadow-xs border-l-4 border-l-primary">
          <h2 className="text-sm font-bold text-text-primary mb-2">Select Your Mentor</h2>
          <p className="text-xs text-secondary mb-4">
            You do not have a mentor assigned yet. Please select an available mentor from the list below to join their group. Mentor groups are capped at 30 students.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md">
            <select
              value={selectedMentor}
              onChange={(e) => setSelectedMentor(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-primary focus:outline-hidden"
              disabled={loadingMentors}
            >
              <option value="">-- Choose a Mentor --</option>
              {mentorsList.map((m) => {
                const isFull = m.studentCount >= 30;
                return (
                  <option key={m._id} value={m._id} disabled={isFull}>
                    {m.name} ({m.studentCount || 0}/30 students) {isFull ? "[FULL]" : ""}
                  </option>
                );
              })}
            </select>
            <button
              onClick={handleJoinGroup}
              disabled={!selectedMentor || loadingMentors}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover shadow-xs focus:outline-hidden disabled:opacity-50"
            >
              {loadingMentors ? "Loading..." : "Join Group"}
            </button>
          </div>
        </div>
      )}

      {/* Row 1: Key Metrics */}
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {/* Attendance progress ring card */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Attendance Status</span>
            <p className="mt-1 text-2xl font-black text-text-primary">
              {student.attendance !== null ? `${student.attendance}%` : "N/A"}
            </p>
            <span className={`text-[10px] font-bold mt-1 ${student.attendance && student.attendance < 75 ? "text-critical" : "text-low"}`}>
              {student.attendance && student.attendance < 75 ? "Below Threshold" : "Satisfactory"}
            </span>
          </div>
          {student.attendance !== null && (
            <div className="relative h-16 w-16">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke={student.attendance < 75 ? "#EF4444" : "#10B981"}
                  strokeWidth="3"
                  strokeDasharray="94.2"
                  strokeDashoffset={94.2 - (student.attendance / 100) * 94.2}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Behavior */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Behavioral Score</span>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xl font-bold">
              {student.behavior === "excellent" || student.behavior === "good" ? "😊" : student.behavior === "average" ? "😐" : "😡"}
            </span>
            <span className={`rounded-md px-2.5 py-0.5 text-xs font-bold capitalize ${
              student.behavior === "excellent" || student.behavior === "good"
                ? "bg-emerald-50 text-low"
                : student.behavior === "average"
                ? "bg-amber-50 text-medium"
                : "bg-red-50 text-critical"
            }`}>
              {student.behavior || "Not assessed"}
            </span>
          </div>
          <span className="mt-2 block text-[9px] font-bold text-slate-400">Classroom participation assessment</span>
        </div>

        {/* Contributions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Co-Curriculars</span>
          <p className="mt-1 text-2xl font-black text-text-primary">{student.contribution.length}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {student.contribution.length === 0 ? (
              <span className="text-[10px] text-slate-400 font-semibold">No active projects/contributions</span>
            ) : (
              student.contribution.slice(0, 3).map((item, idx) => (
                <span key={idx} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-secondary">{item}</span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Academics & AI Panels */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (60%): Marks Table */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2 shadow-xs">
          <h2 className="text-sm font-bold text-text-primary mb-3">Academic Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold text-secondary uppercase tracking-wider bg-slate-50/50">
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Tests</th>
                  <th className="py-2.5 px-3">Mid Term</th>
                  <th className="py-2.5 px-3">House Exam</th>
                  <th className="py-2.5 px-3 text-right">Subject Average</th>
                </tr>
              </thead>
              <tbody>
                {student.marks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-slate-400">No marks record found</td>
                  </tr>
                ) : (
                  student.marks.map((sub, idx) => {
                    const avg = getSubjectAverage(sub);
                    const failing = avg !== null && avg < 35;
                    const borderline = avg !== null && avg >= 35 && avg < 50;

                    return (
                      <tr key={idx} className="border-b border-slate-100 text-xs">
                        <td className="py-3 px-3 font-semibold text-text-primary flex items-center gap-1.5">
                          {sub.subjectName}
                          {sub.isPractical && (
                            <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[8px] font-bold text-primary">LAB</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-secondary font-medium">
                          {sub.classTests.length > 0 
                            ? sub.classTests.map(t => `${t.marks}/${t.maxMarks}`).join(", ") 
                            : "N/A"}
                        </td>
                        <td className="py-3 px-3 text-secondary font-medium">
                          {sub.midTerm.marks !== null ? `${sub.midTerm.marks}/${sub.midTerm.maxMarks}` : "N/A"}
                        </td>
                        <td className="py-3 px-3 text-secondary font-medium">
                          {sub.houseExam.marks !== null ? `${sub.houseExam.marks}/${sub.houseExam.maxMarks}` : "N/A"}
                        </td>
                        <td className={`py-3 px-3 text-right font-bold ${
                          failing ? "text-critical" : borderline ? "text-medium" : "text-low"
                        }`}>
                          {avg !== null ? `${avg.toFixed(1)}%` : "N/A"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column (40%): AI Panel */}
        <div className="flex flex-col gap-5">
          {/* AI Explanation Card */}
          <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-xs border-l-4 border-l-primary relative overflow-hidden">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                <svg className="h-4.5 w-4.5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm1 14.5h-2v-2h2v2zm0-3.5h-2V7h2v4z" />
                </svg>
                AI Risk Analysis
              </span>
              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[8px] font-bold text-primary uppercase tracking-wide">NVIDIA NIM</span>
            </div>
            
            {generatingExplanation ? (
              <div className="space-y-2 mt-3 animate-pulse">
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-5/6 rounded bg-slate-100" />
                <div className="h-3 w-4/5 rounded bg-slate-100" />
              </div>
            ) : student.riskExplanation ? (
              <p className="text-xs text-text-primary leading-relaxed mt-2 italic">
                &ldquo;{student.riskExplanation}&rdquo;
              </p>
            ) : (
              <div className="mt-4 flex flex-col items-center">
                <p className="text-center text-xs text-slate-400">
                  {user?.role === "student"
                    ? "AI assessment has not been generated by your mentor yet."
                    : "Generate a 2-3 sentence AI assessment explaining why this student is at this risk level."}
                </p>
                {user?.role !== "student" && (
                  <button
                    onClick={handleGenerateExplanation}
                    className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-hover shadow-xs focus:outline-hidden"
                  >
                    Generate Explanation
                  </button>
                )}
              </div>
            )}
          </div>

          {/* AI Improvement Plan */}
          <div className="rounded-xl border border-purple-100 bg-white p-5 shadow-xs border-l-4 border-l-purple-500 relative">
            <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block mb-2">Improvement Plan</span>
            
            {generatingPlan ? (
              <div className="space-y-3 mt-3 animate-pulse">
                {[1, 2, 3, 4].map(n => (
                  <div key={n} className="flex gap-2">
                    <div className="h-3.5 w-3.5 shrink-0 rounded-full bg-slate-100" />
                    <div className="h-3 w-full rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : student.aiImprovementPlan ? (
              <div className="mt-2 flex flex-col gap-2.5 overflow-y-auto max-h-56">
                {student.aiImprovementPlan.split("\n").filter(Boolean).map((line, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-50 text-[10px] font-bold text-purple-600">✓</span>
                    <span className="text-xs text-text-primary leading-tight">{line.replace(/^-\s*/, "")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center">
                <p className="text-center text-xs text-slate-400">
                  {user?.role === "student"
                    ? "Academic recovery plan has not been generated by your mentor yet."
                    : "Generate a customized 5-7 step action recovery plan based on failing subjects and attendance."}
                </p>
                {user?.role !== "student" && (
                  <button
                    onClick={handleGeneratePlan}
                    className="mt-3 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700 shadow-xs focus:outline-hidden"
                  >
                    Generate Plan
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Manual overrides / Missing data form (Only for Mentors/Admins) */}
      {user?.role !== "student" && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-xs">
          <button
            onClick={() => setShowOverrideForm(!showOverrideForm)}
            className="flex w-full items-center justify-between px-6 py-4 focus:outline-hidden"
          >
            <span className="text-sm font-bold text-text-primary flex items-center gap-2">
              <svg className="h-4.5 w-4.5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Update Student Data (Manual Override)
            </span>
            <svg className={`h-5 w-5 text-slate-400 transition-all ${showOverrideForm ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showOverrideForm && (
            <form onSubmit={handleSaveOverride} className="border-t border-slate-100 p-6 flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                {/* Attendance input */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-secondary uppercase">Attendance (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formAttendance}
                    onChange={(e) => setFormAttendance(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-hidden"
                    placeholder="e.g. 78"
                  />
                </div>

                {/* Behavior dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-secondary uppercase">Behavior</label>
                  <select
                    value={formBehavior}
                    onChange={(e) => setFormBehavior(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-hidden bg-white"
                  >
                    <option value="">Select Behavior</option>
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="average">Average</option>
                    <option value="bad">Bad</option>
                  </select>
                </div>

                {/* Contributions */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-secondary uppercase">Contributions (comma-separated)</label>
                  <input
                    type="text"
                    value={formContributions}
                    onChange={(e) => setFormContributions(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-hidden"
                    placeholder="e.g. Hackathon, CodingClub"
                  />
                </div>
              </div>

              {/* Subject Marks inputs */}
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5">Subject Marks overrides</h3>
                {student.marks.map((sub) => {
                  const marksVal = formMarks[sub.subjectName] || {
                    test1: "", test1Max: "25",
                    test2: "", test2Max: "25",
                    test3: "", test3Max: "25",
                    midTerm: "", midTermMax: "100",
                    houseExam: "", houseExamMax: "100",
                  };

                  const updateSubField = (field: keyof typeof marksVal, value: string) => {
                    setFormMarks((prev) => ({
                      ...prev,
                      [sub.subjectName]: {
                        ...prev[sub.subjectName],
                        [field]: value,
                      },
                    }));
                  };

                  return (
                    <div key={sub.subjectName} className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                      <h4 className="text-xs font-bold text-text-primary mb-3 flex items-center gap-1.5">
                        {sub.subjectName}
                        {sub.isPractical && <span className="rounded-md bg-indigo-50 px-1 py-0.5 text-[8px] font-bold text-primary">LAB</span>}
                      </h4>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                        {/* Test 1 */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-secondary uppercase">Test 1 (obtained/max)</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={marksVal.test1}
                              onChange={(e) => updateSubField("test1", e.target.value)}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                              placeholder="obt"
                            />
                            <span className="text-slate-400">/</span>
                            <input
                              type="number"
                              value={marksVal.test1Max}
                              onChange={(e) => updateSubField("test1Max", e.target.value)}
                              className="w-12 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                              placeholder="max"
                            />
                          </div>
                        </div>

                        {/* Test 2 */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-secondary uppercase">Test 2</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={marksVal.test2}
                              onChange={(e) => updateSubField("test2", e.target.value)}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                              placeholder="obt"
                            />
                            <span className="text-slate-400">/</span>
                            <input
                              type="number"
                              value={marksVal.test2Max}
                              onChange={(e) => updateSubField("test2Max", e.target.value)}
                              className="w-12 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                              placeholder="max"
                            />
                          </div>
                        </div>

                        {/* Test 3 */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-secondary uppercase">Test 3</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={marksVal.test3}
                              onChange={(e) => updateSubField("test3", e.target.value)}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                              placeholder="obt"
                            />
                            <span className="text-slate-400">/</span>
                            <input
                              type="number"
                              value={marksVal.test3Max}
                              onChange={(e) => updateSubField("test3Max", e.target.value)}
                              className="w-12 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                              placeholder="max"
                            />
                          </div>
                        </div>

                        {/* Mid Term */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-secondary uppercase">Mid Term</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={marksVal.midTerm}
                              onChange={(e) => updateSubField("midTerm", e.target.value)}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                              placeholder="obt"
                            />
                            <span className="text-slate-400">/</span>
                            <input
                              type="number"
                              value={marksVal.midTermMax}
                              onChange={(e) => updateSubField("midTermMax", e.target.value)}
                              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                              placeholder="max"
                            />
                          </div>
                        </div>

                        {/* House Exam */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-secondary uppercase">House Exam</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={marksVal.houseExam}
                              onChange={(e) => updateSubField("houseExam", e.target.value)}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                              placeholder="obt"
                            />
                            <span className="text-slate-400">/</span>
                            <input
                              type="number"
                              value={marksVal.houseExamMax}
                              onChange={(e) => updateSubField("houseExamMax", e.target.value)}
                              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                              placeholder="max"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-3 self-end">
                <button
                  type="button"
                  onClick={() => setShowOverrideForm(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-secondary hover:bg-slate-50 focus:outline-hidden"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover shadow-xs focus:outline-hidden"
                >
                  Save Changes & Recalculate
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Row 4: Mentor Chat Window with AI Fallback */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col h-[500px]">
        {/* Chat Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-3.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                student.mentorId?.isOnline ? "bg-emerald-400" : "bg-slate-400"
              }`} />
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                student.mentorId?.isOnline ? "bg-emerald-500" : "bg-slate-500"
              }`} />
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-text-primary">
                {user?.role === "student"
                  ? `Chat with Mentor (${student.mentorId?.name || "Unassigned"})`
                  : `Chat with Student (${student.name})`}
              </span>
              <span className="text-[9px] text-slate-400 font-semibold mt-0.5">
                {student.mentorId?.isOnline ? "Mentor is Online" : "Mentor Offline (AI Assistant responding)"}
              </span>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              No chat history available. Start the conversation!
            </div>
          ) : (
            messages.map((msg: any, idx: number) => {
              const isMe = user?.role === "student" ? msg.sender === "student" : msg.sender === "mentor";
              const isAI = msg.sender === "ai";

              return (
                <div key={idx} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  {isAI && (
                    <span className="text-[8px] font-bold text-purple-600 uppercase tracking-wider mb-1 ml-3.5">AI Assistant</span>
                  )}
                  <div
                    className={`max-w-md rounded-xl px-4 py-2 text-xs font-medium leading-relaxed shadow-xs ${
                      isMe
                        ? "bg-primary text-white"
                        : isAI
                        ? "bg-purple-100/50 border border-purple-200 text-purple-900 border-l-4 border-l-purple-500 rounded-tl-none"
                        : "bg-slate-100 text-text-primary rounded-tl-none"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[8px] text-slate-400 mt-1 mx-2">
                    {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })
          )}

          {/* AI Typing Indicator */}
          {aiTyping && (
            <div className="flex flex-col items-start">
              <span className="text-[8px] font-bold text-purple-600 uppercase tracking-wider mb-1 ml-3.5">AI Assistant</span>
              <div className="flex items-center gap-1 rounded-xl bg-purple-100/50 border border-purple-200 px-4 py-3 text-xs text-purple-900">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-600" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-600 [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-600 [animation-delay:0.4s]" />
              </div>
            </div>
          )}
        </div>

        {/* Message Input */}
        <form onSubmit={handleSendChat} className="border-t border-slate-100 p-4 bg-white flex gap-2">
          <input
            type="text"
            placeholder={
              !student.mentorId
                ? "You must join a mentor group before you can chat."
                : user?.role === "student"
                ? `Type a message to your mentor...`
                : `Type a message to ${student.name}...`
            }
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={!student.mentorId}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-xs focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <button
            type="submit"
            disabled={!student.mentorId || !chatInput.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover shadow-xs focus:outline-hidden disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default StudentProfile;
