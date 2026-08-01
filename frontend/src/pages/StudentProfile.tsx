import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import axios from "axios";
import socket from "../utils/socket.js";
import toast from "react-hot-toast";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import ReactMarkdown from "react-markdown";
import StudentAttendancePanel from "../components/StudentAttendancePanel.js";
import CRBadge from "../components/CRBadge.js";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import { downloadFile } from "../utils/downloadFile.js";

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
  isCr?: boolean;
  email: string;
  phoneNo: string | null;
  course: string;
  class: string;
  semester: number;
  attendance: number | null;
  behavior: string | null;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  verificationStatus?:
    | "approved"
    | "pending_mentor_approval"
    | "rejected"
    | string;
  riskExplanation?: string;
  aiImprovementPlan?: string;
  contribution: string[];
  marks: SubjectMarks[];
  mentorId?: MentorInfo | null;
  mentorName?: string;
}

interface ReportCardJob {
  _id: string;
  studentName: string;
  status: string;
  createdAt: string;
}

interface AttendanceHistoryRecord {
  date: string;
  session: "morning" | "afternoon";
  status: "present" | "absent";
}

interface IssuedBook {
  bookId: string;
  title: string;
  issueDate: string;
  dueDate: string;
  status: "on-time" | "overdue";
}

interface ProfileChartPoint {
  name?: string;
  date?: string;
  attendance?: number;
  "Class Tests (%)"?: number;
  "Mid Term (%)"?: number;
  "House Exam (%)"?: number;
}

const StudentProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // If student views their own profile, studentId is user.id
  const studentId = user?.role === "student" ? user.id : id;

  // Tabs for Student vs Mentor
  const [activeTab, setActiveTab] = useState<
    "performance" | "attendance" | "books" | "chat" | "notifications" | "settings"
  >(() => new URLSearchParams(window.location.search).get("tab") === "books" ? "books" : "performance");

  // States
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [selectedMentor, setSelectedMentor] = useState("");
  const [mentorsList, setMentorsList] = useState<any[]>([]);
  const [, setLoadingMentors] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const [aiThinkingStep, setAiThinkingStep] = useState(0);
  const [chatTotalPages, setChatTotalPages] = useState(1);
  const [loadingOlderChat, setLoadingOlderChat] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatPageRef = useRef(1);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const suppressChatAutoScrollRef = useRef(false);
  const shouldScrollChatToBottomRef = useRef(false);

  // Notifications State
  const [alerts, setAlerts] = useState<any[]>([]);
  const [issuedBooks, setIssuedBooks] = useState<IssuedBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState("");
  const [reportCards, setReportCards] = useState<ReportCardJob[]>([]);
  const [reportCardsLoading, setReportCardsLoading] = useState(false);
  const [reportCardsError, setReportCardsError] = useState("");
  const [downloadingReportCard, setDownloadingReportCard] = useState<string | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryRecord[]>([]);
  const [attendancePercentage, setAttendancePercentage] = useState<number | null>(null);
  const [attendanceChartLoading, setAttendanceChartLoading] = useState(false);
  const [attendanceChartError, setAttendanceChartError] = useState("");
  const [chartMode, setChartMode] = useState<"marks" | "attendance">("marks");
  const [savingOverride, setSavingOverride] = useState(false);

  useEffect(() => {
    if (activeTab !== "books" || user?.role !== "student" || !studentId) return;
    setBooksLoading(true);
    setBooksError("");
    axios.get(`/api/library/students/${studentId}/books`)
      .then((response) => setIssuedBooks(response.data.data ?? []))
      .catch((error) => { const message = error.response?.data?.message || "Could not load issued books"; setBooksError(message); toast.error(message); })
      .finally(() => setBooksLoading(false));
  }, [activeTab, studentId, user?.role]);

  // Overrides modal for Mentors/Admins
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [formAttendance, setFormAttendance] = useState("");
  const [formBehavior, setFormBehavior] = useState("");
  const [formContributions, setFormContributions] = useState("");
  const [formMarks, setFormMarks] = useState<
    Record<
      string,
      {
        test1: string;
        test1Max: string;
        test2: string;
        test2Max: string;
        test3: string;
        test3Max: string;
        midTerm: string;
        midTermMax: string;
        houseExam: string;
        houseExamMax: string;
      }
    >
  >({});

  const [generatingExplanation, setGeneratingExplanation] = useState(false);

  const normalizeMessage = (message: any) => ({
    ...message,
    _id: message?._id || message?.id || message?.Id,
    studentId: message?.studentId || message?.StudentId,
    mentorId: message?.mentorId || message?.MentorId,
    sender: message?.sender || message?.Sender,
    text: message?.text || message?.Text,
    createdAt: message?.createdAt || message?.CreatedAt,
  });

  const getMessageId = (message: any) =>
    message?._id || message?.id || message?.Id || "";
  const sameText = (a: string = "", b: string = "") =>
    a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");
  const findLastIndex = <T,>(items: T[], matches: (item: T) => boolean) => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (matches(items[i])) return i;
    }
    return -1;
  };

  const mergeChatMessages = (incoming: any[]) => {
    setMessages((prev) => {
      const next = prev.map(normalizeMessage);

      incoming.forEach((rawMsg) => {
        const msg = normalizeMessage(rawMsg);
        const msgId = getMessageId(msg);
        const existingIndex = next.findIndex(
          (m) => msgId && getMessageId(m) === msgId,
        );
        if (existingIndex !== -1) {
          next[existingIndex] = msg;
          return;
        }

        const pendingIndex = next.findIndex(
          (m) =>
            (m.pending || String(m._id || "").startsWith("temp-")) &&
            m.studentId === msg.studentId &&
            m.mentorId === msg.mentorId &&
            m.sender === msg.sender &&
            m.text === msg.text,
        );

        if (pendingIndex !== -1) {
          next[pendingIndex] = msg;
          return;
        }

        const streamingAiIndex = findLastIndex(
          next,
          (m) =>
            m.sender === "ai" &&
            msg.sender === "ai" &&
            m.studentId === msg.studentId &&
            m.mentorId === msg.mentorId &&
            String(getMessageId(m)).startsWith("ai-stream-") &&
            (m.streaming || sameText(m.text, msg.text)),
        );

        if (streamingAiIndex !== -1) {
          next[streamingAiIndex] = msg;
          return;
        }

        const duplicateIndex = next.findIndex(
          (m) =>
            !String(getMessageId(m)).startsWith("temp-") &&
            m.studentId === msg.studentId &&
            m.mentorId === msg.mentorId &&
            m.sender === msg.sender &&
            m.text === msg.text &&
            Math.abs(
              new Date(m.createdAt || 0).getTime() -
                new Date(msg.createdAt || 0).getTime(),
            ) < 3000,
        );

        if (duplicateIndex !== -1) {
          next[duplicateIndex] = msg;
          return;
        }

        next.push(msg);
      });

      return next.sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime(),
      );
    });
  };

  const loadChatPage = async (page = 1, keepScroll = false) => {
    if (!student?._id || loadingOlderChat) return;

    const scrollBox = chatScrollRef.current;
    const oldHeight = scrollBox?.scrollHeight || 0;
    if (keepScroll) suppressChatAutoScrollRef.current = true;
    setLoadingOlderChat(true);
    setChatError("");
    try {
      const res = await axios.get(`/api/chat/${student._id}`, {
        params: { page, limit: 20 },
      });
      if (res.data.success) {
        mergeChatMessages(res.data.data);
        chatPageRef.current = page;
        setChatTotalPages(res.data.pages || 1);

        if (keepScroll && scrollBox) {
          requestAnimationFrame(() => {
            scrollBox.scrollTop = scrollBox.scrollHeight - oldHeight;
          });
        } else if (page === 1) {
          shouldScrollChatToBottomRef.current = true;
        }
      }
    } catch (err) {
      console.error("Failed to load chat history:", err);
      setChatError("Failed to load chat history.");
    } finally {
      setLoadingOlderChat(false);
    }
  };

  const fetchStudent = async (resetOverrideInputs = false) => {
    if (!studentId) return;
    setProfileError("");

    // Load from sessionStorage if available
    const cacheKey = `student_profile_${studentId}`;
    const cachedDataStr = sessionStorage.getItem(cacheKey);
    let cachedData: Student | null = null;
    if (cachedDataStr) {
      try {
        cachedData = JSON.parse(cachedDataStr);
        if (cachedData) {
          setStudent(cachedData);
          if (resetOverrideInputs) {
            setFormAttendance(
              cachedData.attendance !== null
                ? String(cachedData.attendance)
                : "",
            );
            setFormBehavior(cachedData.behavior || "");
            setFormContributions(cachedData.contribution.join(", "));

            const marksInit: typeof formMarks = {};
            for (const sub of cachedData.marks) {
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
                midTerm:
                  sub.midTerm.marks !== null ? String(sub.midTerm.marks) : "",
                midTermMax: String(sub.midTerm.maxMarks || 100),
                houseExam:
                  sub.houseExam.marks !== null
                    ? String(sub.houseExam.marks)
                    : "",
                houseExamMax: String(sub.houseExam.maxMarks || 100),
              };
            }
            setFormMarks(marksInit);
          }
          setLoading(false);
        }
      } catch (e) {
        console.error("Failed to parse cached student profile", e);
      }
    } else {
      setLoading(true);
    }

    try {
      const res = await axios.get(`/api/students/${studentId}`);
      if (res.data.success) {
        const data: Student = res.data.data;
        setStudent(data);

        // Save to cache
        sessionStorage.setItem(cacheKey, JSON.stringify(data));

        if (resetOverrideInputs || !cachedData) {
          setFormAttendance(
            data.attendance !== null ? String(data.attendance) : "",
          );
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
              midTerm:
                sub.midTerm.marks !== null ? String(sub.midTerm.marks) : "",
              midTermMax: String(sub.midTerm.maxMarks || 100),
              houseExam:
                sub.houseExam.marks !== null ? String(sub.houseExam.marks) : "",
              houseExamMax: String(sub.houseExam.maxMarks || 100),
            };
          }
          setFormMarks(marksInit);
        }
      }
    } catch (err) {
      console.error(err);
      if (!cachedData) {
        setProfileError("Failed to load student profile.");
        toast.error("Failed to load student profile");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMentors = async (signal?: AbortSignal) => {
    const CACHE_KEY = "eduguard_mentors_list";
    const TTL = 10 * 60 * 1000; // 10 minutes

    // Show cached data immediately
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < TTL) {
          setMentorsList(data);
          setLoadingMentors(false);
        }
      }
    } catch (_) {
      /* ignore parse errors */
    }

    // Fetch fresh data in background
    setLoadingMentors(true);
    try {
      const res = await axios.get("/api/mentors/list", { signal });
      if (res.data.success) {
        setMentorsList(res.data.data);
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ data: res.data.data, timestamp: Date.now() }),
        );
      }
    } catch (err) {
      if (!axios.isCancel(err)) console.error(err);
    } finally {
      setLoadingMentors(false);
    }
  };

  const fetchNotifications = async (signal?: AbortSignal) => {
    const CACHE_KEY = "eduguard_student_alerts";
    const TTL = 5 * 60 * 1000; // 5 minutes

    // Show cached data immediately
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < TTL) {
          setAlerts(data);
        }
      }
    } catch (_) {
      /* ignore parse errors */
    }

    // Fetch fresh data in background
    try {
      const res = await axios.get("/api/students/my-alerts", { signal });
      if (res.data.success) {
        setAlerts(res.data.data);
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ data: res.data.data, timestamp: Date.now() }),
        );
      }
    } catch (err) {
      if (!axios.isCancel(err)) console.error(err);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    fetchStudent(true);
    if (user?.role === "student") {
      fetchMentors(signal);
      fetchNotifications(signal);
      setReportCardsLoading(true); setReportCardsError("");
      axios.get("/api/students/me/report-card/jobs", { signal })
        .then((response) => setReportCards(response.data.data || []))
        .catch((error) => { if (!axios.isCancel(error)) { console.error(error); setReportCardsError("Failed to load report cards."); } })
        .finally(() => setReportCardsLoading(false));
    }

    return () => {
      controller.abort();
    };
  }, [studentId]);

  // Socket communication
  useEffect(() => {
    if (!student) return;
    setAttendanceChartLoading(true); setAttendanceChartError("");
    axios.get(`/api/attendance/student/${student._id}/history`)
      .then((response) => {
        setAttendanceHistory(response.data.data || []);
        setAttendancePercentage(response.data.attendancePercentage ?? null);
      })
      .catch((error) => { console.error("Failed to load attendance chart", error); setAttendanceChartError("Failed to load attendance history."); })
      .finally(() => setAttendanceChartLoading(false));

    // Join room
    socket.connect();
    socket.emit("joinRoom", student._id);

    // Load latest chat history page
    setMessages([]);
    chatPageRef.current = 1;
    setChatTotalPages(1);
    loadChatPage(1);

    socket.on("newMessage", (msg: any) => {
      if (msg.studentId === student._id) {
        mergeChatMessages([msg]);
      }
    });

    socket.on("aiMessageStart", (data: any) => {
      if (data.studentId !== student._id) return;

      setAiTyping(false);
      setMessages((prev) => {
        if (prev.some((msg) => msg._id === data.messageId)) return prev;

        return [
          ...prev,
          {
            _id: data.messageId,
            studentId: data.studentId,
            mentorId: data.mentorId,
            sender: "ai",
            text: "",
            streaming: true,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    });

    socket.on("aiMessageChunk", (data: any) => {
      if (data.studentId !== student._id) return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.messageId
            ? { ...msg, text: `${msg.text || ""}${data.chunk || ""}` }
            : msg,
        ),
      );
    });

    socket.on("aiMessageEnd", (data: any) => {
      if (data.studentId !== student._id) return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.messageId ? { ...msg, streaming: false } : msg,
        ),
      );
    });

    socket.on("typing", (data: { sender: string; isTyping: boolean }) => {
      if (data.sender === "ai") {
        setAiTyping(data.isTyping);
      }
    });

    return () => {
      socket.off("newMessage");
      socket.off("aiMessageStart");
      socket.off("aiMessageChunk");
      socket.off("aiMessageEnd");
      socket.off("typing");
    };
  }, [student]);

  const handleChatScroll = () => {
    if (
      !chatScrollRef.current ||
      loadingOlderChat ||
      chatPageRef.current >= chatTotalPages
    )
      return;
    if (chatScrollRef.current.scrollTop <= 24) {
      loadChatPage(chatPageRef.current + 1, true);
    }
  };

  useEffect(() => {
    if (suppressChatAutoScrollRef.current) {
      suppressChatAutoScrollRef.current = false;
      return;
    }
    const behavior = shouldScrollChatToBottomRef.current ? "auto" : "smooth";
    shouldScrollChatToBottomRef.current = false;
    requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ behavior });
    });
  }, [messages, aiTyping]);

  useEffect(() => {
    if (!aiTyping) {
      setAiThinkingStep(0);
      return;
    }

    const timer = window.setInterval(() => {
      setAiThinkingStep((step) => step + 1);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [aiTyping]);

  // Actions
  const handleJoinGroup = async () => {
    if (!selectedMentor) return;
    try {
      const res = await axios.patch("/api/students/select-mentor", {
        mentorId: selectedMentor,
      });
      if (res.data.success) {
        toast.success("Joined mentor group!");
        // Clear class overview cache
        Object.keys(sessionStorage).forEach((key) => {
          if (key.startsWith("class_data_")) {
            sessionStorage.removeItem(key);
          }
        });
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

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !student || !user || !student.mentorId?._id)
      return;

    const text = chatInput.trim();
    const sender = user.role === "student" ? "student" : "mentor";
    const tempId = `temp-${Date.now()}`;
    const mentorId = student.mentorId._id;
    const shouldExpectAi = sender === "student" && !student.mentorId.isOnline;
    setChatInput("");
    mergeChatMessages([
      {
        _id: tempId,
        studentId: student._id,
        mentorId,
        sender,
        text,
        pending: true,
        createdAt: new Date().toISOString(),
      },
    ]);
    if (shouldExpectAi) setAiTyping(true);

    try {
      const res = await axios.post("/api/chat/send", {
        studentId: student._id,
        mentorId,
        sender,
        text,
      });
      if (res.data.success) {
        const savedMessage = res.data.data;
        if (savedMessage) mergeChatMessages([savedMessage]);
        const history = await axios.get(`/api/chat/${student._id}`, {
          params: { page: 1, limit: 20 },
        });
        if (history.data.success) mergeChatMessages(history.data.data);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages((prev) => prev.filter((msg) => msg._id !== tempId));
      setChatInput(text); // restore input on failure
      toast.error("Message failed to send");
    } finally {
      setAiTyping(false);
    }
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;

    const updatedMarks: SubjectMarks[] = student.marks.map((sub) => {
      const inputs = formMarks[sub.subjectName] || {
        test1: "",
        test1Max: "25",
        test2: "",
        test2Max: "25",
        test3: "",
        test3Max: "25",
        midTerm: "",
        midTermMax: "100",
        houseExam: "",
        houseExamMax: "100",
      };

      const classTests: ClassTest[] = [];
      if (inputs.test1)
        classTests.push({
          testNumber: 1,
          marks: Number(inputs.test1),
          maxMarks: Number(inputs.test1Max),
        });
      if (inputs.test2)
        classTests.push({
          testNumber: 2,
          marks: Number(inputs.test2),
          maxMarks: Number(inputs.test2Max),
        });
      if (inputs.test3)
        classTests.push({
          testNumber: 3,
          marks: Number(inputs.test3),
          maxMarks: Number(inputs.test3Max),
        });

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

    setSavingOverride(true);
    try {
      const res = await axios.patch(`/api/students/${studentId}`, payload);
      if (res.data.success) {
        toast.success("Roster record updated successfully!");
        // Clear class overview cache
        Object.keys(sessionStorage).forEach((key) => {
          if (key.startsWith("class_data_")) {
            sessionStorage.removeItem(key);
          }
        });
        setShowOverrideForm(false);
        fetchStudent(false);
      }
    } catch (err) {
      toast.error("Failed to update records");
    } finally { setSavingOverride(false); }
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

  const downloadReportCard = async (job: ReportCardJob) => {
    if (downloadingReportCard) return;
    setDownloadingReportCard(job._id);
    try {
      const result = await downloadFile(`/api/students/report-card/download/${job._id}/pdf`, `Report-Card-${job.studentName.replace(/\s+/g, "-")}.pdf`, "application/pdf");
      toast.success(result === "started" ? "Downloading report card to Downloads." : "Report card downloaded.");
    } catch {
      toast.error("Failed to download report card.");
    } finally {
      setDownloadingReportCard(null);
    }
  };

  if (loading) return <LoadingState label="Loading student profile…" />;
  if (profileError || !student) return <ErrorState message={profileError || "Student profile not found."} onRetry={() => fetchStudent(true)} />;

  // Map marks data to Recharts format
  const chartData: ProfileChartPoint[] = student.marks.map((sub) => {
    const tMax = sub.classTests.reduce((sum, t) => sum + t.maxMarks, 0);
    const tObt = sub.classTests.reduce((sum, t) => sum + t.marks, 0);
    const testPct = tMax > 0 ? (tObt / tMax) * 100 : 0;

    const midPct =
      sub.midTerm.marks !== null
        ? (sub.midTerm.marks / sub.midTerm.maxMarks) * 100
        : 0;
    const housePct =
      sub.houseExam.marks !== null
        ? (sub.houseExam.marks / sub.houseExam.maxMarks) * 100
        : 0;

    return {
      name: sub.subjectName,
      "Class Tests (%)": Math.round(testPct),
      "Mid Term (%)": Math.round(midPct),
      "House Exam (%)": Math.round(housePct),
    };
  });
  const attendanceChartData: ProfileChartPoint[] = Object.values(attendanceHistory.reduce<Record<string, AttendanceHistoryRecord[]>>((days, record) => {
    (days[record.date] ||= []).push(record);
    return days;
  }, {})).map((records) => ({
    date: new Date(`${records[0].date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    attendance: records.filter((record) => record.status === "present").length * 50,
  })).slice(-30);

  return (
    <div className="main-content flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-6 font-sans">
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
          <div className="h-16 w-16 rounded-full bg-primary/5 text-[#12274E] font-bold text-xl flex items-center justify-center border border-primary/15">
            {student.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-[#202124]">{student.name}</h1>
              {student.isCr && <CRBadge />}
            </div>
            <p className="text-xs text-[#5f6368] mt-1 font-medium">
              Roll No: #{student.rollNo} · {student.course} · {student.class}
            </p>
            <span className="inline-flex px-2 py-0.5 rounded-md bg-primary/5 text-[#12274E] text-[10px] font-semibold mt-2 border border-primary/10">
              Mentor: {student.mentorId?.name || "Unassigned"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-[#5f6368] font-bold uppercase tracking-wider block">
              Risk Score
            </span>
            <span
              className={`text-xl font-bold uppercase ${
                student.riskLevel === "low"
                  ? "text-green-700"
                  : student.riskLevel === "medium"
                    ? "text-amber-700"
                    : "text-red-700"
              }`}
            >
              {student.riskScore}/100 ({student.riskLevel})
            </span>
          </div>
        </div>
      </div>

      {/* Blocker overlay for Flow B pending approval */}
      {user?.role === "student" &&
        student.verificationStatus === "pending_mentor_approval" && (
          <div className="mb-6 p-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 shadow-sm flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <svg
                className="h-6 w-6 text-amber-600 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h2 className="font-bold text-sm">
                Enrollment Pending Mentor Approval
              </h2>
            </div>
            <p className="text-xs leading-normal max-w-2xl">
              Your self-registered account has been successfully verified via
              OTP. However, full access to your academic records, mentor chat,
              and assignment portal requires approval from your assigned mentor{" "}
              <strong>
                {student.mentorId?.name || student.mentorName || "Unassigned"}
              </strong>
              . Please contact them or wait for verification.
            </p>
          </div>
        )}

      {user?.role === "student" &&
        student.verificationStatus === "rejected" && (
          <div className="mb-6 p-6 rounded-2xl bg-red-50 border border-red-200 text-red-800 shadow-sm flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <svg
                className="h-6 w-6 text-red-600 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h2 className="font-bold text-sm">Enrollment Rejected</h2>
            </div>
            <p className="text-xs leading-normal max-w-2xl">
              Your enrollment request has been rejected by your assigned mentor.
              Please consult the college administration department for
              assistance.
            </p>
          </div>
        )}

      {/* Rest of the page is only accessible if student is approved, or if logged in user is a mentor/admin */}
      {user?.role !== "student" || student.verificationStatus === "approved" ? (
        <>
          {user?.role !== "student" && <div className="mb-6 flex gap-2 overflow-x-auto border-b border-[#dadce0] pb-px">{[{ id: "performance", label: "Academic Performance" }, { id: "chat", label: "Student Chat" }].map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold ${activeTab === tab.id ? "border-[#12274E] bg-primary/5 text-[#12274E]" : "border-transparent text-[#5f6368]"}`}>{tab.label}</button>)}</div>}
          {/* Student portal tabs */}
          {user?.role === "student" && (
            <div className="mb-6 border-b border-[#dadce0] flex gap-2 overflow-x-auto pb-px">
              {[
                { id: "performance", label: "Academic Performance" },
                { id: "attendance", label: "Attendance" },
                { id: "books", label: "Books" },
                {
                  id: "chat",
                  label: `Chat with Mentor ${student.mentorId?.isOnline ? "●" : ""}`,
                },
                { id: "notifications", label: `Alerts (${alerts.length})` },
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
          )}

          {/* 1. PERFORMANCE TAB */}
          {activeTab === "performance" && (
            <div className="space-y-6">
              {/* Join Group Alert */}
              {(!student.mentorId || student.mentorId._id === "ai-assistant") &&
                user?.role === "student" && (
                  <div className="p-5 bg-primary/5 border border-primary/15 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#12274E]">
                        Select Academic Mentor
                      </h3>
                      <p className="text-xs text-[#5f6368] mt-1 font-medium">
                        Join an instructor group to start early academic
                        tracking assessments.
                      </p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <select
                        value={selectedMentor}
                        onChange={(e) => setSelectedMentor(e.target.value)}
                        className="rounded-lg border border-[#dadce0] px-3 py-1.5 text-xs bg-white focus:outline-none"
                      >
                        <option value="">Choose Instructor...</option>
                        {mentorsList.map((m) => (
                          <option key={m._id} value={m._id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleJoinGroup}
                        className="bg-[#12274E] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#0B1830]"
                      >
                        Join
                      </button>
                    </div>
                  </div>
                )}

              {/* Cards metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-[#dadce0] rounded-2xl p-5 shadow-sm">
                  <span className="text-[10px] text-[#5f6368] font-bold uppercase tracking-wider block">
                    Attendance
                  </span>
                  <span className="text-2xl font-bold text-[#202124] mt-2 block">
                    {(attendancePercentage ?? student.attendance) != null
                      ? `${attendancePercentage ?? student.attendance}%`
                      : "N/A"}
                  </span>
                  <span className="text-[10px] text-[#5f6368] mt-1 block">
                    Threshold: 75% standard
                  </span>
                </div>
                <div className="bg-white border border-[#dadce0] rounded-2xl p-5 shadow-sm">
                  <span className="text-[10px] text-[#5f6368] font-bold uppercase tracking-wider block">
                    Behavior assessment
                  </span>
                  <span className="text-2xl font-bold text-[#202124] mt-2 block capitalize">
                    {student.behavior || "Excellent"}
                  </span>
                  <span className="text-[10px] text-[#5f6368] mt-1 block">
                    Classroom participation level
                  </span>
                </div>
                <div className="bg-white border border-[#dadce0] rounded-2xl p-5 shadow-sm">
                  <span className="text-[10px] text-[#5f6368] font-bold uppercase tracking-wider block">
                    Co-Curriculars
                  </span>
                  <span className="text-2xl font-bold text-[#202124] mt-2 block">
                    {student.contribution.length} Active
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {student.contribution.map((c, i) => (
                      <span
                        key={i}
                        className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-semibold"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {user?.role === "student" && reportCardsLoading && <LoadingState label="Loading report cards…" compact />}
              {user?.role === "student" && reportCardsError && <ErrorState message={reportCardsError} compact />}
              {user?.role === "student" && !reportCardsLoading && !reportCardsError && reportCards.some((job) => job.status === "completed") && (
                <section className="rounded-2xl border border-[#dadce0] bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-[#202124]">Report Cards</h3>
                  <p className="mb-4 mt-1 text-xs text-[#5f6368]">Report cards generated by your mentor.</p>
                  <div className="space-y-3">{reportCards.filter((job) => job.status === "completed").map((job) => <div key={job._id} className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><span className="block text-xs font-bold text-slate-800">Academic Report Card</span><span className="text-[10px] text-slate-500">Generated {new Date(job.createdAt).toLocaleDateString()}</span></div><div className="flex gap-2"><button type="button" onClick={() => navigate(`/reportcard/${job._id}`)} className="rounded-lg border border-primary/20 bg-white px-3 py-1.5 text-[10px] font-bold text-primary">View</button><button type="button" onClick={() => downloadReportCard(job)} disabled={downloadingReportCard !== null} className="flex min-w-24 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{downloadingReportCard === job._id && <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}{downloadingReportCard === job._id ? "Downloading..." : "Download"}</button></div></div>)}</div>
                </section>
              )}

              {/* Performance chart */}
              <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#202124]">{chartMode === "marks" ? "Subject Performance Analysis" : "Attendance History"}</h3><button type="button" onClick={() => setChartMode((mode) => mode === "marks" ? "attendance" : "marks")} className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary">Show {chartMode === "marks" ? "Attendance" : "Marks"}</button></div>
                <div className="h-64">
                  {chartMode === "attendance" && attendanceChartLoading ? <LoadingState label="Loading attendance history…" compact /> : chartMode === "attendance" && attendanceChartError ? <ErrorState message={attendanceChartError} compact /> : <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartMode === "marks" ? chartData : attendanceChartData}>
                      <XAxis
                        dataKey={chartMode === "marks" ? "name" : "date"}
                        stroke="#5f6368"
                        fontSize={10}
                        tickLine={false}
                      />
                      <YAxis stroke="#5f6368" fontSize={10} tickLine={false} domain={chartMode === "attendance" ? [0, 100] : undefined} />
                      <Tooltip />
                      {chartMode === "marks" ? <>
                      <Legend /><Bar
                        dataKey="Class Tests (%)"
                        fill="#12274E"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="Mid Term (%)"
                        fill="#f9ab00"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="House Exam (%)"
                        fill="#e37400"
                        radius={[4, 4, 0, 0]}
                      /></> : <Bar dataKey="attendance" name="Attendance (%)" fill="#10b981" radius={[4, 4, 0, 0]} />}
                    </BarChart>
                  </ResponsiveContainer>}
                </div>
              </div>

              {/* AI Advisor Panel */}
              <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-[#202124]">
                    EduGuard AI Advisor
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportMarkdown}
                      className="bg-white border border-[#dadce0] text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
                    >
                      Export Markdown
                    </button>
                    <button
                      onClick={handleExportPDF}
                      className="bg-[#12274E] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#0B1830] transition-colors"
                    >
                      Export Report PDF
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {/* Risk explanation */}
                  <div className="p-4 rounded-xl border border-[#dadce0] bg-slate-50/50">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-[#202124]">
                        Performance Risk Factors
                      </span>
                      {user?.role !== "student" && (
                        <button
                          onClick={handleGenerateRiskAnalysis}
                          disabled={generatingExplanation}
                          className="text-xs text-[#12274E] font-bold hover:underline"
                        >
                          {generatingExplanation
                            ? "Analyzing..."
                            : "Re-evaluate"}
                        </button>
                      )}
                    </div>
                    {student.riskExplanation ? (
                      <div className="text-xs text-[#202124] leading-relaxed prose prose-sm max-w-none">
                        <ReactMarkdown>{student.riskExplanation}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-xs text-[#5f6368] italic py-6 text-center">
                        No AI explanation cached. Click Re-evaluate to generate.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Overrides button for mentors/admins */}
              {user?.role !== "student" && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowOverrideForm(!showOverrideForm)}
                    className="bg-[#12274E] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#0B1830] transition-all shadow-sm"
                  >
                    Modify Records & Overrides
                  </button>
                </div>
              )}

              {/* Override Form Panel */}
              {showOverrideForm && (
                <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-[#202124] mb-4">
                    Edit Roster Parameters
                  </h3>
                  <form onSubmit={handleSaveOverride} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#5f6368] mb-1">
                          Attendance (%)
                        </label>
                        <input
                          type="number"
                          value={formAttendance}
                          onChange={(e) => setFormAttendance(e.target.value)}
                          className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#5f6368] mb-1">
                          Behavior assessment
                        </label>
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
                        <label className="block text-xs font-medium text-[#5f6368] mb-1">
                          Co-Curriculars (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={formContributions}
                          onChange={(e) => setFormContributions(e.target.value)}
                          className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-4 mt-6">
                      <h4 className="text-xs font-bold text-[#202124] border-b pb-2 uppercase tracking-wide">
                        Academics obtained / max marks
                      </h4>
                      {student.marks.map((sub) => {
                        const marksVal = formMarks[sub.subjectName] || {
                          test1: "",
                          test1Max: "25",
                          test2: "",
                          test2Max: "25",
                          test3: "",
                          test3Max: "25",
                          midTerm: "",
                          midTermMax: "100",
                          houseExam: "",
                          houseExamMax: "100",
                        };

                        const updateSubField = (
                          field: keyof typeof marksVal,
                          value: string,
                        ) => {
                          setFormMarks((prev) => ({
                            ...prev,
                            [sub.subjectName]: {
                              ...prev[sub.subjectName],
                              [field]: value,
                            },
                          }));
                        };

                        return (
                          <div
                            key={sub.subjectName}
                            className="p-4 border rounded-xl bg-slate-50/50"
                          >
                            <span className="text-xs font-semibold text-[#202124] block mb-3">
                              {sub.subjectName}
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                              <div>
                                <label className="block text-[10px] text-[#5f6368] font-semibold mb-1">
                                  Test 1
                                </label>
                                <input
                                  type="number"
                                  placeholder="obt"
                                  value={marksVal.test1}
                                  onChange={(e) =>
                                    updateSubField("test1", e.target.value)
                                  }
                                  className="w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#5f6368] font-semibold mb-1">
                                  Test 2
                                </label>
                                <input
                                  type="number"
                                  placeholder="obt"
                                  value={marksVal.test2}
                                  onChange={(e) =>
                                    updateSubField("test2", e.target.value)
                                  }
                                  className="w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#5f6368] font-semibold mb-1">
                                  Test 3
                                </label>
                                <input
                                  type="number"
                                  placeholder="obt"
                                  value={marksVal.test3}
                                  onChange={(e) =>
                                    updateSubField("test3", e.target.value)
                                  }
                                  className="w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#5f6368] font-semibold mb-1">
                                  Mid Term (obt/max)
                                </label>
                                <div className="flex gap-1">
                                  <input
                                    type="number"
                                    placeholder="obt"
                                    value={marksVal.midTerm}
                                    onChange={(e) =>
                                      updateSubField("midTerm", e.target.value)
                                    }
                                    className="w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                                  />
                                  <input
                                    type="number"
                                    placeholder="max"
                                    value={marksVal.midTermMax}
                                    onChange={(e) =>
                                      updateSubField(
                                        "midTermMax",
                                        e.target.value,
                                      )
                                    }
                                    className="w-12 rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#5f6368] font-semibold mb-1">
                                  House Exam (obt/max)
                                </label>
                                <div className="flex gap-1">
                                  <input
                                    type="number"
                                    placeholder="obt"
                                    value={marksVal.houseExam}
                                    onChange={(e) =>
                                      updateSubField(
                                        "houseExam",
                                        e.target.value,
                                      )
                                    }
                                    className="w-full rounded-lg border px-2 py-1 text-xs bg-white focus:outline-none"
                                  />
                                  <input
                                    type="number"
                                    placeholder="max"
                                    value={marksVal.houseExamMax}
                                    onChange={(e) =>
                                      updateSubField(
                                        "houseExamMax",
                                        e.target.value,
                                      )
                                    }
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
                        disabled={savingOverride}
                        className="bg-[#12274E] text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-[#0B1830]"
                      >
                        {savingOverride ? "Saving…" : "Save Modifications & Recalculate"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {user?.role === "student" && activeTab === "attendance" && <StudentAttendancePanel />}

          {user?.role === "student" && activeTab === "books" && (
            <section className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#202124]">Issued library books</h3>
                  <p className="mt-1 text-xs text-[#5f6368]">Read-only LMS record · maximum 2 active issues</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{issuedBooks.length}/2</span>
              </div>
              {booksLoading ? (
                <LoadingState label="Loading issued books…" compact />
              ) : booksError ? (
                <ErrorState message={booksError} compact />
              ) : issuedBooks.length === 0 ? (
                <p className="py-8 text-center text-xs italic text-slate-500">No books are currently issued.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {issuedBooks.map((book) => (
                    <article key={book.bookId} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-sm font-semibold text-slate-900">{book.title}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${book.status === "overdue" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{book.status}</span>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                        <div><dt className="text-slate-500">Issued</dt><dd className="mt-1 font-medium text-slate-800">{new Date(book.issueDate).toLocaleDateString()}</dd></div>
                        <div><dt className="text-slate-500">Due</dt><dd className="mt-1 font-medium text-slate-800">{new Date(book.dueDate).toLocaleDateString()}</dd></div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 2. CHAT TAB */}
          {activeTab === "chat" && (
            <div className="bg-white border border-[#dadce0] rounded-2xl shadow-sm overflow-hidden flex flex-col h-[500px] mt-6">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-[#dadce0] flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${student.mentorId?.isOnline ? "bg-green-500 animate-pulse" : "bg-slate-400"}`}
                  />
                  <span className="text-xs font-semibold text-[#202124]">
                    {user?.role === "student"
                      ? `Instructor Chat (${student.mentorId?.name || "None"})`
                      : `Student Chat (${student.name})`}
                  </span>
                </div>
                {!student.mentorId?.isOnline && user?.role === "student" && (
                  <span className="text-[10px] bg-purple-50 text-purple-700 font-bold border border-purple-100 px-2 py-0.5 rounded-full">
                    AI Agent Active (Mentor Offline)
                  </span>
                )}
              </div>

              {/* Chat Messages scroll area */}
              <div
                ref={chatScrollRef}
                onScroll={handleChatScroll}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/20"
              >
                {loadingOlderChat && (
                  <LoadingState label={messages.length ? "Loading older messages…" : "Loading chat history…"} compact />
                )}
                {chatError && <ErrorState message={chatError} compact />}
                {messages.map((msg, index) => {
                  const isMe =
                    user?.role === "student"
                      ? msg.sender === "student"
                      : msg.sender === "mentor";
                  const isAI = msg.sender === "ai";
                  return (
                    <div
                      key={msg._id || index}
                      className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                    >
                      {isAI && (
                        <span className="text-[9px] text-purple-700 font-semibold mb-0.5 ml-1">
                          {msg.streaming
                            ? "AI Agent responding..."
                            : "AI Agent Fallback"}
                        </span>
                      )}
                      <div
                        className={`max-w-md px-3.5 py-2 rounded-xl text-xs font-medium ${
                          isMe
                            ? "bg-primary text-white"
                            : isAI
                              ? "bg-purple-100 border border-purple-200 text-purple-900"
                              : "bg-white border border-[#dadce0] text-[#202124]"
                        }`}
                      >
                        {msg.text}
                        {msg.streaming && (
                          <span className="ml-0.5 animate-pulse">|</span>
                        )}
                      </div>
                      {msg.pending && (
                        <span className="mt-0.5 text-[9px] font-medium text-slate-400">
                          Sending...
                        </span>
                      )}
                    </div>
                  );
                })}
                {aiTyping && (
                  <div className="flex flex-col items-start">
                    <span className="text-[9px] text-purple-700 font-semibold mb-0.5 ml-1">
                      AI Assistant
                    </span>
                    <div className="relative overflow-hidden px-3.5 py-2 rounded-xl bg-purple-50 border border-purple-200 text-transparent text-xs font-bold">
                      <span className="relative z-10 text-purple-700">
                        {
                          [
                            "Thinking...",
                            "Writing a helpful reply...",
                            "Still working on it...",
                            "Preparing guidance...",
                            "Almost there...",
                          ][aiThinkingStep % 6]
                        }
                      </span>
                      <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
                      •••
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form
                onSubmit={handleSendChat}
                className="border-t border-[#dadce0] p-4 bg-white flex gap-2"
              >
                <input
                  type="text"
                  required
                  placeholder={
                    student.mentorId
                      ? "Type a message..."
                      : "Join a mentor group to activate chat portal"
                  }
                  disabled={!student.mentorId}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 border rounded-lg px-4 py-2 text-xs focus:outline-none disabled:bg-slate-100"
                />
                <button
                  type="submit"
                  disabled={!student.mentorId}
                  className="bg-[#12274E] text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-[#0B1830] disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </div>
          )}

          {/* 3. ALERTS / NOTIFICATIONS TAB */}
          {user?.role === "student" && activeTab === "notifications" && (
            <div className="bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm mt-6">
              <h3 className="text-sm font-semibold text-[#202124] mb-4">
                Workspace Announcements & Event Notifications
              </h3>
              {alerts.length === 0 ? (
                <p className="text-xs text-[#5f6368] italic py-8 text-center">
                  No alerts broadcasted yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {alerts.map((n) => (
                    <div
                      key={n._id}
                      className={`p-4 border rounded-xl flex gap-3 ${n.type === "event" ? "bg-purple-50/50 border-purple-100" : "bg-primary/5 border-primary/15"}`}
                    >
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${n.type === "event" ? "bg-purple-100" : "bg-primary/10"}`}
                      >
                        {n.type === "event" ? (
                          <svg
                            className="h-4 w-4 text-purple-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="h-4 w-4 text-primary"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${n.type === "event" ? "bg-purple-200 text-purple-800" : "bg-primary/15 text-primary"}`}
                          >
                            {n.type === "event" ? "Event" : "Announcement"}
                          </span>
                        </div>
                        {n.title && (
                          <span className="text-xs font-bold text-[#202124] block">
                            {n.title}
                          </span>
                        )}
                        <span className="text-xs text-[#3c4043] block mt-0.5">
                          {n.message}
                        </span>
                        {n.type === "event" && n.location && (
                          <span className="text-[10px] text-purple-700 mt-1 block">
                            📍 {n.location}
                            {n.date
                              ? ` · ${new Date(n.date).toLocaleDateString()}`
                              : ""}
                          </span>
                        )}
                        {n.type === "event" && n.registrationLink && (
                          <a
                            href={n.registrationLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary font-semibold hover:underline mt-1 inline-block"
                          >
                            Register →
                          </a>
                        )}
                        <span className="text-[10px] text-[#5f6368] mt-1 block">
                          {new Date(n.createdAt).toLocaleDateString()} at{" "}
                          {new Date(n.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 bg-white border border-[#dadce0] rounded-2xl p-6 shadow-sm mt-6">
          <svg
            className="h-12 w-12 text-slate-300 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h3 className="text-sm font-semibold text-slate-700">
            Access Restricted
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Please wait for mentor verification to unlock your student profile
            workspace.
          </p>
        </div>
      )}
    </div>
  );
};

export default StudentProfile;
