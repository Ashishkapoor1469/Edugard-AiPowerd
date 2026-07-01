import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import axios from "axios";
import socket from "../utils/socket.js";
import toast from "react-hot-toast";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import ReactMarkdown from "react-markdown";

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

interface MentorInfo {
  _id: string;
  name: string;
  email: string;
  isOnline?: boolean;
}

interface Student {
  _id: string;
  rollNo: string;
  name: string;
  email: string;
  phoneNo: string | null;
  course: string;
  class: string;
  semester: number;
  attendance: number | null;
  behavior: string | null;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskExplanation?: string;
  aiImprovementPlan?: string;
  contribution: string[];
  marks: SubjectMarks[];
  mentorId?: MentorInfo | null;
}

const StudentProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // If student views their own profile, studentId is user.id
  const studentId = user?.role === "student" ? user.id : id;

  // Tabs for Student vs Mentor
  const [activeTab, setActiveTab] = useState<"performance" | "chat" | "notifications" | "settings">("performance");

  // States
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMentor, setSelectedMentor] = useState("");
  const [mentorsList, setMentorsList] = useState<any[]>([]);
  const [, setLoadingMentors] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Notifications State
  const [alerts, setAlerts] = useState<any[]>([]);

  // Overrides modal for Mentors/Admins
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

  const [generatingExplanation, setGeneratingExplanation] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const fetchStudent = async (resetOverrideInputs = false) => {
    if (!studentId) return;
    try {
      const res = await axios.get(`/api/students/${studentId}`);
      if (res.data.success) {
        const data: Student = res.data.data;
        setStudent(data);

        if (resetOverrideInputs) {
          setFormAttendance(data.attendance !== null ? String(data.attendance) : "");
          setFormBehavior(data.behavior || "");
          setFormContributions(data.contribution.join(", "));

          const marksInit: typeof formMarks = {};
          for (const sub of data.marks) {
            const t1 = sub.classTests.find((t: any) => t.testNumber === 1);
            const t2 = sub.classTests.find((t: any) => t.testNumber === 2);
            const t3 = sub.classTests.find((t: any) => t.testNumber === 3);

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
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load student profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchMentors = async () => {
    setLoadingMentors(true);
    try {
      const res = await axios.get("/api/mentors/list");
      if (res.data.success) setMentorsList(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMentors(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await axios.get("/api/notifications");
      if (res.data.success) setAlerts(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchStudent(true);
    if (user?.role === "student") {
      fetchMentors();
      fetchNotifications();
    }
  }, [studentId]);

  // Socket communication
  useEffect(() => {
    if (!student) return;

    // Join room
    socket.connect();
    socket.emit("joinRoom", student._id);

    // Load history
    axios.get(`/api/chat/${student._id}`).then((res) => {
      if (res.data.success) setMessages(res.data.data);
    });

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

    return () => {
      socket.off("newMessage");
      socket.off("typing");
    };
  }, [student]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiTyping]);

  // Actions
  const handleJoinGroup = async () => {
    if (!selectedMentor) return;
    try {
      const res = await axios.patch("/api/students/select-mentor", { mentorId: selectedMentor });
      if (res.data.success) {
        toast.success("Joined mentor group!");
        fetchStudent(true);
      }
    } catch (err) {
      toast.error("Failed to join mentor group");
    }
  };

  const handleGenerateRiskAnalysis = async () => {
    setGeneratingExplanation(true);
    try {
      const res = await axios.get(`/api/students/${studentId}/explanation`);
      if (res.data.success) {
        toast.success("AI Risk analysis completed!");
        fetchStudent(false);
      }
    } catch (err) {
      toast.error("AI Generation failed");
    } finally {
      setGeneratingExplanation(false);
    }
  };

  const handleGenerateRecoveryPlan = async () => {
    setGeneratingPlan(true);
    try {
      const res = await axios.get(`/api/students/${studentId}/improvement`);
      if (res.data.success) {
        toast.success("AI Recovery Plan ready!");
        fetchStudent(false);
      }
    } catch (err) {
      toast.error("AI Plan generation failed");
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !student || !user || !student.mentorId?._id) return;

    const text = chatInput.trim();
    setChatInput("");

    try {
      await axios.post("/api/chat/send", {
        studentId: student._id,
        mentorId: student.mentorId._id,
        sender: user.role === "student" ? "student" : "mentor",
        text,
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      setChatInput(text); // restore input on failure
    }
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;

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
        midTerm: { marks: inputs.midTerm ? Number(inputs.midTerm) : null, maxMarks: Number(inputs.midTermMax) },
        houseExam: { marks: inputs.houseExam ? Number(inputs.houseExam) : null, maxMarks: Number(inputs.houseExamMax) },
      };
    });

    const payload = {
      attendance: formAttendance !== "" ? Number(formAttendance) : null,
      behavior: formBehavior || null,
      contribution: formContributions.split(",").map((c) => c.trim()).filter(Boolean),
      marks: updatedMarks,
    };

    try {
      const res = await axios.patch(`/api/students/${studentId}`, payload);
      if (res.data.success) {
        toast.success("Roster record updated successfully!");
        setShowOverrideForm(false);
        fetchStudent(false);
      }
    } catch (err) {
      toast.error("Failed to update records");
    }
  };

  // Export functions
  const handleExportMarkdown = () => {
    if (!student) return;
    const content = `# Academic Performance Report: ${student.name}
Roll No: ${student.rollNo}
Class: ${student.class}
Risk Level: ${student.riskLevel} (${student.riskScore}/100)

## AI Risk Explanation
${student.riskExplanation || "No assessment generated."}

## AI Personalized Recovery Plan
${student.aiImprovementPlan || "No plan generated."}
`;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Academic_Report_${student.rollNo}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    window.print();
  };

  if (loading || !student) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fa] animate-pulse">
        <svg className="h-10 w-10 animate-spin text-[#1a73e8]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  // Map marks data to Recharts format
  const chartData = student.marks.map((sub) => {
    const tMax = sub.classTests.reduce((sum, t) => sum + t.maxMarks, 0);
    const tObt = sub.classTests.reduce((sum, t) => sum + t.marks, 0);
    const testPct = tMax > 0 ? (tObt / tMax) * 100 : 0;

    const midPct = sub.midTerm.marks !== null ? (sub.midTerm.marks / sub.midTerm.maxMarks) * 100 : 0;
    const housePct = sub.houseExam.marks !== null ? (sub.houseExam.marks / sub.houseExam.maxMarks) * 100 : 0;

    return {
      name: sub.subjectName,
      "Class Tests (%)": Math.round(testPct),
      "Mid Term (%)": Math.round(midPct),
      "House Exam (%)": Math.round(housePct),
    };
  });

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-6 font-sans">
      {/* Back to Dashboard (Instructor only) */}
      {user?.role !== "student" && (
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1 text-xs font-semibold text-[#5f6368] hover:text-primary transition-colors"
        >
          &larr; Back to Dashboard
        </button>
      )}

      {/* Profile Header */}
      <div className="mb-6 rounded-2xl bg-white border border-[#dadce0] p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-blue-50 text-[#1a73e8] font-bold text-xl flex items-center justify-center border border-blue-100">
            {student.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#202124]">{student.name}</h1>
            <p className="text-xs text-[#5f6368] mt-1 font-medium">Roll No: #{student.rollNo} · {student.course} · {student.class}</p>
            <span className="inline-flex px-2 py-0.5 rounded-md bg-blue-50 text-[#1a73e8] text-[10px] font-semibold mt-2 border border-blue-100/50">
              Mentor: {student.mentorId?.name || "Unassigned"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-[#5f6368] font-bold uppercase tracking-wider block">Risk Score</span>
            <span className={`text-xl font-bold uppercase ${
              student.riskLevel === "low" ? "text-green-700" :
              student.riskLevel === "medium" ? "text-amber-700" : "text-red-700"
            }`}>{student.riskScore}/100 ({student.riskLevel})</span>
          </div>
        </div>
      </div>

      {/* Tabs Menu (Only if student views their own portal) */}
      {user?.role === "student" && (
        <div className="mb-6 border-b border-[#dadce0] flex gap-2 overflow-x-auto pb-px">
          {[
            { id: "performance", label: "Academic Performance" },
            { id: "chat", label: `Chat with Mentor ${student.mentorId?.isOnline ? "●" : ""}` },
            { id: "notifications", label: `Alerts (${alerts.length})` },
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
      )}

      {/* 1. PERFORMANCE TAB */}
      {(user?.role !== "student" || activeTab === "performance") && (
        <div className="space-y-6">
          {/* Join Group Alert */}
          {!student.mentorId && user?.role === "student" && (
            <div className="p-5 bg-blue-50 border border-blue-100 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#1a73e8]">Select Academic Mentor</h3>
                <p className="text-xs text-[#5f6368] mt-1 font-medium">Join an instructor group to start early academic tracking assessments.</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={selectedMentor}
                  onChange={(e) => setSelectedMentor(e.target.value)}
                  className="rounded-lg border border-[#dadce0] px-3 py-1.5 text-xs bg-white focus:outline-none"
                >
                  <option value="">Choose Instructor...</option>
                  {mentorsList.map((m) => (
                    <option key={m._id} value={m._id}>{m.name}</option>
                  ))}
                </select>
                <button onClick={handleJoinGroup} className="bg-[#1a73e8] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#1557b0]">
                  Join
                </button>
              </div>
            </div>
          )}

          {/* Cards metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-[#dadce0] rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] text-[#5f6368] font-bold uppercase tracking-wider block">Attendance</span>
              <span className="text-2xl font-bold text-[#202124] mt-2 block">{student.attendance != null ? `${student.attendance}%` : "N/A"}</span>
              <span className="text-[10px] text-[#5f6368] mt-1 block">Threshold: 75% standard</span>
            </div>
            <div className="bg-white border border-[#dadce0] rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] text-[#5f6368] font-bold uppercase tracking-wider block">Behavior assessment</span>
              <span className="text-2xl font-bold text-[#202124] mt-2 block capitalize">{student.behavior || "Excellent"}</span>
              <span className="text-[10px] text-[#5f6368] mt-1 block">Classroom participation level</span>
            </div>
            <div className="bg-white border border-[#dadce0] rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] text-[#5f6368] font-bold uppercase tracking-wider block">Co-Curriculars</span>
              <span className="text-2xl font-bold text-[#202124] mt-2 block">{student.contribution.length} Active</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {student.contribution.map((c, i) => (
                  <span key={i} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-semibold">{c}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Performance chart */}
          <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[#202124] mb-4">Subject Performance Analysis</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#5f6368" fontSize={10} tickLine={false} />
                  <YAxis stroke="#5f6368" fontSize={10} tickLine={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Class Tests (%)" fill="#1a73e8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Mid Term (%)" fill="#f9ab00" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="House Exam (%)" fill="#e37400" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Advisor Panel */}
          <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-[#202124]">EduGuard AI Advisor</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleExportMarkdown}
                  className="bg-white border border-[#dadce0] text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Export Markdown
                </button>
                <button
                  onClick={handleExportPDF}
                  className="bg-[#1a73e8] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#1557b0] transition-colors"
                >
                  Export Report PDF
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Risk explanation */}
              <div className="p-4 rounded-xl border border-[#dadce0] bg-slate-50/50">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-[#202124]">Performance Risk Factors</span>
                  {user?.role !== "student" && (
                    <button
                      onClick={handleGenerateRiskAnalysis}
                      disabled={generatingExplanation}
                      className="text-xs text-[#1a73e8] font-bold hover:underline"
                    >
                      {generatingExplanation ? "Analyzing..." : "Re-evaluate"}
                    </button>
                  )}
                </div>
                {student.riskExplanation ? (
                  <div className="text-xs text-[#202124] leading-relaxed prose prose-sm max-w-none">
                    <ReactMarkdown>{student.riskExplanation}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-[#5f6368] italic py-6 text-center">No AI explanation cached. Click Re-evaluate to generate.</p>
                )}
              </div>

              {/* Recovery Plan */}
              <div className="p-4 rounded-xl border border-[#dadce0] bg-slate-50/50">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-[#202124]">Weekly Learning Study Plan</span>
                  {user?.role !== "student" && (
                    <button
                      onClick={handleGenerateRecoveryPlan}
                      disabled={generatingPlan}
                      className="text-xs text-[#1a73e8] font-bold hover:underline"
                    >
                      {generatingPlan ? "Constructing..." : "Re-generate Plan"}
                    </button>
                  )}
                </div>
                {student.aiImprovementPlan ? (
                  <div className="text-xs text-[#202124] leading-relaxed prose prose-sm max-w-none">
                    <ReactMarkdown>{student.aiImprovementPlan}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-[#5f6368] italic py-6 text-center">No active study planner generated by instructor.</p>
                )}
              </div>
            </div>
          </div>

          {/* Overrides button for mentors/admins */}
          {user?.role !== "student" && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowOverrideForm(!showOverrideForm)}
                className="bg-[#1a73e8] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#1557b0] transition-all shadow-sm"
              >
                Modify Records & Overrides
              </button>
            </div>
          )}

          {/* Override Form Panel */}
          {showOverrideForm && (
            <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-[#202124] mb-4">Edit Roster Parameters</h3>
              <form onSubmit={handleSaveOverride} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#5f6368] mb-1">Attendance (%)</label>
                    <input
                      type="number"
                      value={formAttendance}
                      onChange={(e) => setFormAttendance(e.target.value)}
                      className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5f6368] mb-1">Behavior assessment</label>
                    <select
                      value={formBehavior}
                      onChange={(e) => setFormBehavior(e.target.value)}
                      className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:outline-none bg-white"
                    >
                      <option value="excellent">Excellent</option>
                      <option value="good">Good</option>
                      <option value="average">Average</option>
                      <option value="bad">Bad</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5f6368] mb-1">Co-Curriculars (comma-separated)</label>
                    <input
                      type="text"
                      value={formContributions}
                      onChange={(e) => setFormContributions(e.target.value)}
                      className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-4 mt-6">
                  <h4 className="text-xs font-bold text-[#202124] border-b pb-2 uppercase tracking-wide">Academics obtained / max marks</h4>
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
                      <div key={sub.subjectName} className="p-4 border rounded-xl bg-slate-50/50">
                        <span className="text-xs font-semibold text-[#202124] block mb-3">{sub.subjectName}</span>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-[10px] text-[#5f6368] font-semibold mb-1">Test 1</label>
                            <input
                              type="number"
                              placeholder="obt"
                              value={marksVal.test1}
                              onChange={(e) => updateSubField("test1", e.target.value)}
                              className="w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#5f6368] font-semibold mb-1">Test 2</label>
                            <input
                              type="number"
                              placeholder="obt"
                              value={marksVal.test2}
                              onChange={(e) => updateSubField("test2", e.target.value)}
                              className="w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#5f6368] font-semibold mb-1">Test 3</label>
                            <input
                              type="number"
                              placeholder="obt"
                              value={marksVal.test3}
                              onChange={(e) => updateSubField("test3", e.target.value)}
                              className="w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#5f6368] font-semibold mb-1">Mid Term (obt/max)</label>
                            <div className="flex gap-1">
                              <input
                                type="number"
                                placeholder="obt"
                                value={marksVal.midTerm}
                                onChange={(e) => updateSubField("midTerm", e.target.value)}
                                className="w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                              />
                              <input
                                type="number"
                                placeholder="max"
                                value={marksVal.midTermMax}
                                onChange={(e) => updateSubField("midTermMax", e.target.value)}
                                className="w-12 rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#5f6368] font-semibold mb-1">House Exam (obt/max)</label>
                            <div className="flex gap-1">
                              <input
                                type="number"
                                placeholder="obt"
                                value={marksVal.houseExam}
                                onChange={(e) => updateSubField("houseExam", e.target.value)}
                                className="w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                              />
                              <input
                                type="number"
                                placeholder="max"
                                value={marksVal.houseExamMax}
                                onChange={(e) => updateSubField("houseExamMax", e.target.value)}
                                className="w-12 rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowOverrideForm(false)}
                    className="border border-[#dadce0] text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[#1a73e8] text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-[#1557b0]"
                  >
                    Save Modifications & Recalculate
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* 2. CHAT TAB */}
      {(user?.role !== "student" || activeTab === "chat") && (
        <div className="bg-white border border-[#dadce0] rounded-2xl shadow-sm overflow-hidden flex flex-col h-[500px] mt-6">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-[#dadce0] flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${student.mentorId?.isOnline ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
              <span className="text-xs font-semibold text-[#202124]">
                {user?.role === "student" ? `Instructor Chat (${student.mentorId?.name || "None"})` : `Student Chat (${student.name})`}
              </span>
            </div>
            {!student.mentorId?.isOnline && user?.role === "student" && (
              <span className="text-[10px] bg-purple-50 text-purple-700 font-bold border border-purple-100 px-2 py-0.5 rounded-full">
                AI Agent Active (Mentor Offline)
              </span>
            )}
          </div>

          {/* Chat Messages scroll area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/20">
            {messages.map((msg, index) => {
              const isMe = user?.role === "student" ? msg.sender === "student" : msg.sender === "mentor";
              const isAI = msg.sender === "ai";
              return (
                <div key={index} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  {isAI && (
                    <span className="text-[9px] text-purple-700 font-semibold mb-0.5 ml-1">AI Agent Fallback</span>
                  )}
                  <div className={`max-w-md px-3.5 py-2 rounded-xl text-xs font-medium ${
                    isMe ? "bg-primary text-white" : isAI ? "bg-purple-100 border border-purple-200 text-purple-900" : "bg-white border border-[#dadce0] text-[#202124]"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              );
            })}
            {aiTyping && (
              <div className="flex flex-col items-start">
                <span className="text-[9px] text-purple-700 font-semibold mb-0.5 ml-1">AI Assistant typing...</span>
                <div className="px-3.5 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-600 text-xs font-bold animate-pulse">
                  •••
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendChat} className="border-t border-[#dadce0] p-4 bg-white flex gap-2">
            <input
              type="text"
              required
              placeholder={student.mentorId ? "Type a message..." : "Join a mentor group to activate chat portal"}
              disabled={!student.mentorId}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 border rounded-lg px-4 py-2 text-xs focus:outline-none disabled:bg-slate-100"
            />
            <button type="submit" disabled={!student.mentorId} className="bg-[#1a73e8] text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-[#1557b0] disabled:opacity-50">
              Send
            </button>
          </form>
        </div>
      )}

      {/* 3. ALERTS / NOTIFICATIONS TAB */}
      {user?.role === "student" && activeTab === "notifications" && (
        <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm mt-6">
          <h3 className="text-sm font-semibold text-[#202124] mb-4">Workspace Announcements & Event Notifications</h3>
          {alerts.length === 0 ? (
            <p className="text-xs text-[#5f6368] italic py-8 text-center">No alerts broadcasted yet.</p>
          ) : (
            <div className="space-y-4">
              {alerts.map((n) => (
                <div key={n._id} className="p-4 border rounded-xl bg-slate-50/50 flex gap-3">
                  <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-[#202124] block">{n.message}</span>
                    <span className="text-[10px] text-[#5f6368] mt-1 block">
                      {new Date(n.createdAt).toLocaleDateString()} at {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentProfile;
