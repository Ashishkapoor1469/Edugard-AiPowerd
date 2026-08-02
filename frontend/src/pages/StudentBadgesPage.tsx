import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext.js";
import { ErrorState, LoadingState } from "../components/AsyncState.js";
import StudentAchievementsSection from "../components/achievements/StudentAchievementsSection.js";

type Student = { _id: string; name: string; rollNo: string; class: string; isCr?: boolean };

export default function StudentBadgesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const studentId = user?.role === "student" ? user.id : params.get("studentId");
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!studentId) return;
    let active = true;
    axios.get(`/api/students/${studentId}`).then(({ data }) => { if (active) setStudent(data.data); }).catch((err) => { if (active) setError(err.response?.data?.message || "Could not load student badges"); });
    return () => { active = false; };
  }, [studentId]);
  if (!studentId) return <Navigate to="/" replace />;
  return <main className="main-content flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-6">
    <div className="mx-auto max-w-7xl">
      <button type="button" onClick={() => navigate(-1)} className="mb-4 text-xs font-bold text-slate-600 hover:text-[#3155C6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3155C6]/25">← Back</button>
      {error ? <ErrorState message={error} /> : !student ? <LoadingState label="Loading achievements and badges…" /> : <StudentAchievementsSection student={student} isCr={student.isCr} canAward={user?.role === "mentor" || user?.role === "admin" || user?.role === "college-admin"} awardedBy={user?.name} />}
    </div>
  </main>;
}
