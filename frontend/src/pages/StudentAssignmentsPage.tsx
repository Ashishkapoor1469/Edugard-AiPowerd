import React, { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import ReactMarkdown from "react-markdown";

interface Assignment {
  _id: string;
  title: string;
  description: string;
  instructions?: string;
  deadline: string;
}

interface Submission {
  _id?: string;
  studentId: string;
  submittedPdfUrl: string;
  grade?: string;
  feedback?: string;
  submittedAt?: string;
}

type StudyPlanSegment =
  | { type: "markdown"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] };

const isMarkdownTableSeparator = (line: string) =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const parseMarkdownTableRow = (line: string) => {
  const trimmed = line.trim();
  const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split("|").map((cell) => cell.trim());
};

const splitStudyPlanMarkdown = (content: string): StudyPlanSegment[] => {
  const lines = content.split(/\r?\n/);
  const segments: StudyPlanSegment[] = [];
  let markdownBuffer: string[] = [];

  const flushMarkdown = () => {
    const markdown = markdownBuffer.join("\n").trim();
    if (markdown) {
      segments.push({ type: "markdown", content: markdown });
    }
    markdownBuffer = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const nextLine = lines[index + 1] || "";

    if (line.includes("|") && isMarkdownTableSeparator(nextLine)) {
      flushMarkdown();

      const headers = parseMarkdownTableRow(line);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = parseMarkdownTableRow(lines[index]);
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] || ""));
        index += 1;
      }

      index -= 1;
      segments.push({ type: "table", headers, rows });
    } else {
      markdownBuffer.push(line);
    }
  }

  flushMarkdown();
  return segments;
};

const StudentAssignmentsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"assignments" | "studyplan">("assignments");
  
  // Student Profile Data (contains AI study plans)
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Assignments State
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<{ [assignmentId: string]: Submission }>({});
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Submit Modal/Form State
  const [selectedAsgn, setSelectedAsgn] = useState<Assignment | null>(null);
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchProfile = async () => {
    setLoadingProfile(true);
    try {
      const res = await axios.get("/api/auth/me");
      if (res.data.success) {
        const cacheKey = `student_profile_${res.data.data.id}`;
        const cachedDataStr = sessionStorage.getItem(cacheKey);
        if (cachedDataStr) {
          try {
            setStudentProfile(JSON.parse(cachedDataStr));
            setLoadingProfile(false);
          } catch {
            sessionStorage.removeItem(cacheKey);
          }
        }

        // Resolve student profile
        const studentRes = await axios.get(`/api/students/${res.data.data.id}`);
        if (studentRes.data.success) {
          setStudentProfile(studentRes.data.data);
          sessionStorage.setItem(cacheKey, JSON.stringify(studentRes.data.data));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const fetchAssignments = async () => {
    if (!studentProfile) return;
    setLoadingAssignments(true);
    try {
      const res = await axios.get("/api/students/assignments", {
        params: {
          courseId: studentProfile.courseId,
          class: studentProfile.class,
        },
      });
      if (res.data.success) {
        const asgns = res.data.data;
        setAssignments(asgns);
        
        // Fetch submission status for each assignment
        const subsMap: { [key: string]: Submission } = {};
        for (const asgn of asgns) {
          try {
            const subRes = await axios.get(`/api/students/assignments/${asgn._id}/submissions`);
            if (subRes.data.success) {
              const mySub = subRes.data.data.find((s: any) => s.studentId === studentProfile._id);
              if (mySub) {
                subsMap[asgn._id] = mySub;
              }
            }
          } catch (e) {
            console.error("Failed to fetch submission for assignment", asgn._id, e);
          }
        }
        setSubmissions(subsMap);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load assignments");
    } finally {
      setLoadingAssignments(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    if (studentProfile) {
      fetchAssignments();
    }
  }, [studentProfile]);

  const handleSubmitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsgn || !submissionUrl) return;

    setSubmitting(true);
    try {
      const res = await axios.post(`/api/students/assignments/${selectedAsgn._id}/submit`, {
        studentId: studentProfile._id,
        submittedPdfUrl: submissionUrl,
      });

      if (res.data.success) {
        toast.success("Assignment submitted successfully!");
        setSubmissionUrl("");
        setSelectedAsgn(null);
        fetchAssignments();
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit assignment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="main-content flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-6 font-sans">
      {/* Header Banner */}
      <div className="mb-6 rounded-2xl bg-white border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Academic Hub</h1>
          <p className="text-xs text-slate-500 mt-1">Manage coursework submissions and explore customized AI study plans.</p>
        </div>
        <div className="flex gap-2 border border-slate-200 rounded-lg p-1 bg-slate-50">
          <button
            onClick={() => setActiveTab("assignments")}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
              activeTab === "assignments"
                ? "bg-white text-primary shadow-xs border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            My Assignments
          </button>
          <button
            onClick={() => setActiveTab("studyplan")}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
              activeTab === "studyplan"
                ? "bg-white text-primary shadow-xs border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            AI Study Plan
          </button>
        </div>
      </div>

      {/* BLOCKER IF STUDENT PENDING APPROVED */}
      {studentProfile && studentProfile.verificationStatus !== "approved" && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 p-6 text-center shadow-xs">
          <svg className="h-10 w-10 text-amber-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-sm font-bold">Enrollment Verification Pending</h2>
          <p className="text-xs mt-1 text-amber-700">Please wait for your assigned mentor to verify your account registration to view assignments.</p>
        </div>
      )}

      {/* MAIN LAYOUT */}
      {studentProfile && studentProfile.verificationStatus === "approved" && (
        <div className="grid grid-cols-1 gap-6">
          {/* TAB 1: ASSIGNMENTS */}
          {activeTab === "assignments" && (
            <div className="space-y-4">
              {loadingAssignments ? (
                <div className="flex justify-center py-10">
                  <svg className="h-6 w-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : assignments.length === 0 ? (
                <p className="text-xs text-slate-500 py-12 text-center italic border border-dashed border-slate-200 rounded-2xl bg-white">
                  No assignments have been assigned to your class yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {assignments.map((asgn) => {
                    const sub = submissions[asgn._id];
                    return (
                      <div key={asgn._id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
                        <div>
                          <div className="flex justify-between items-start gap-3">
                            <h3 className="text-sm font-bold text-slate-800 line-clamp-1">{asgn.title}</h3>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                              sub ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-orange-50 text-orange-700 border border-orange-100"
                            }`}>
                              {sub ? "Submitted" : "Pending"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-2 line-clamp-2">{asgn.description}</p>
                          
                          {asgn.instructions && (
                            <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100 text-[10px] text-slate-600">
                              <span className="font-bold text-slate-800 uppercase block mb-1">Instructions:</span>
                              {asgn.instructions}
                            </div>
                          )}

                          <div className="mt-4 flex items-center justify-between text-[10px] text-slate-400 font-semibold border-t border-slate-100 pt-3">
                            <span>Deadline: {new Date(asgn.deadline).toLocaleDateString()} at {new Date(asgn.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-slate-100 pt-4 flex gap-2">
                          {sub ? (
                            <div className="w-full">
                              <div className="flex justify-between items-center text-[10px] mb-1">
                                <span className="text-slate-400">Submission File/Link:</span>
                                <a href={sub.submittedPdfUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline font-bold">View submission &rarr;</a>
                              </div>
                              {sub.grade ? (
                                <div className="mt-2 bg-primary/5 border border-primary/15 rounded-xl p-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Evaluation Grade:</span>
                                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-xs font-bold">{sub.grade}</span>
                                  </div>
                                  {sub.feedback && (
                                    <p className="text-[10px] text-slate-600 mt-1.5 leading-normal">
                                      <strong>Feedback:</strong> {sub.feedback}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-2 text-center text-[10px] text-slate-400 italic">Waiting for mentor feedback & evaluation.</div>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => setSelectedAsgn(asgn)}
                              className="w-full bg-primary text-white py-2 rounded-lg text-xs font-bold hover:bg-primary-hover transition-colors"
                            >
                              Submit Assignment
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AI STUDY PLAN */}
          {activeTab === "studyplan" && (
            <div className="space-y-6">
              {loadingProfile ? (
                <div className="flex justify-center py-10">
                  <svg className="h-6 w-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {/* Weekly Learning Study Plan */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="h-8 w-8 rounded-lg bg-primary/5 border border-primary/15 flex items-center justify-center text-primary">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 00-2 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </div>
                        <h2 className="text-sm font-bold text-slate-800">Weekly Learning Study Plan</h2>
                      </div>
                      
                      {studentProfile.aiImprovementPlan ? (
                        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
                          <div className="space-y-4">
                            {splitStudyPlanMarkdown(studentProfile.aiImprovementPlan).map((segment, index) => (
                              segment.type === "table" ? (
                                <div key={`table-${index}`} className="overflow-x-auto rounded-xl border border-primary/15 bg-white shadow-xs">
                                  <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                                    <thead className="bg-primary/5 text-[10px] font-bold uppercase tracking-wide text-primary">
                                      <tr>
                                        {segment.headers.map((header, headerIndex) => (
                                          <th key={`${header}-${headerIndex}`} className="border-b border-primary/15 px-3 py-2">
                                            {header}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                                      {segment.rows.map((row, rowIndex) => (
                                        <tr key={rowIndex} className="align-top odd:bg-white even:bg-slate-50/60">
                                          {row.map((cell, cellIndex) => (
                                            <td key={cellIndex} className="px-3 py-2 leading-relaxed">
                                              <ReactMarkdown
                                                components={{
                                                  p: ({ children }) => <span>{children}</span>,
                                                  strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
                                                }}
                                              >
                                                {cell}
                                              </ReactMarkdown>
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div key={`markdown-${index}`} className="prose prose-sm max-w-none text-slate-700 prose-headings:mt-3 prose-headings:mb-2 prose-headings:text-slate-900 prose-headings:font-bold prose-p:my-2 prose-p:text-xs prose-p:leading-relaxed prose-strong:text-slate-900 prose-li:my-1 prose-li:text-xs prose-ul:my-2 prose-ol:my-2 prose-code:rounded prose-code:bg-white prose-code:px-1 prose-code:py-0.5 prose-code:text-[11px] prose-code:text-primary">
                                  <ReactMarkdown
                                    components={{
                                      h1: ({ children }) => <h3 className="text-sm font-bold text-slate-900">{children}</h3>,
                                      h2: ({ children }) => <h3 className="mt-4 border-t border-primary/15 pt-3 text-sm font-bold text-slate-900">{children}</h3>,
                                      h3: ({ children }) => <h4 className="mt-3 text-xs font-bold uppercase tracking-wide text-primary">{children}</h4>,
                                      ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
                                      ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
                                      li: ({ children }) => <li className="pl-1 leading-relaxed text-slate-700">{children}</li>,
                                      p: ({ children }) => <p className="text-xs leading-relaxed text-slate-700">{children}</p>,
                                      blockquote: ({ children }) => (
                                        <blockquote className="my-3 border-l-4 border-primary bg-white/70 py-2 pl-3 text-xs font-medium text-slate-700">
                                          {children}
                                        </blockquote>
                                      ),
                                    }}
                                  >
                                    {segment.content}
                                  </ReactMarkdown>
                                </div>
                              )
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 py-10 text-center italic border border-dashed border-slate-100 rounded-xl">
                          No study plan has been generated for you by AI assistants.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUBMISSION DIALOG MODAL */}
      {selectedAsgn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl relative animate-in fade-in duration-200">
            <button
              onClick={() => setSelectedAsgn(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-sm font-bold text-slate-800 mb-2">Submit Assignment</h3>
            <p className="text-xs text-slate-500 mb-4">Provide the link/file address where your assignment can be verified by your mentor.</p>
            
            <form onSubmit={handleSubmitAssignment} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Submission File Link or URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://drive.google.com/..."
                  value={submissionUrl}
                  onChange={(e) => setSubmissionUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-hidden"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-white py-2 rounded-lg text-xs font-bold hover:bg-primary-hover disabled:bg-slate-300 transition-colors"
              >
                {submitting ? "Submitting..." : "Submit Coursework"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentAssignmentsPage;
