import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import axios from "axios";
import toast from "react-hot-toast";
import eduGuardLogo from "../assets/e.png";
import eduGuardBrand from "../assets/e-witheduguardtext.png";
import GoogleSignInButton from "../components/GoogleSignInButton.js";

interface College {
  _id: string;
  name: string;
}

interface Degree {
  _id: string;
  name: string;
  durationYears: number;
}

interface Mentor {
  _id: string;
  name: string;
  assignedCount?: number;
  capacity?: number;
  maxStudents?: number;
}

const Login: React.FC = () => {
  const { login, loginWithGoogle, register } = useAuth();
  const navigate = useNavigate();

  // Role selections: mentor, student, admin
  const [roleMode, setRoleMode] = useState<"mentor" | "student" | "admin">("mentor");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Verification Step for Student Signup
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  // Base Credentials
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rollNo, setRollNo] = useState("");

  // Mentor Signup specific inputs
  const [assignedClassesInput, setAssignedClassesInput] = useState("");
  const [department, setDepartment] = useState("");

  // Student Signup specific selectors
  const [colleges, setColleges] = useState<College[]>([]);
  const [selectedCollege, setSelectedCollege] = useState("");

  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [selectedDegree, setSelectedDegree] = useState("");
  const [section, setSection] = useState("");
  const [semester, setSemester] = useState("");

  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [selectedMentor, setSelectedMentor] = useState("");
  const [mentorsLoading, setMentorsLoading] = useState(false);
  const [mentorLookupMessage, setMentorLookupMessage] = useState("");
  const [collegesLoading, setCollegesLoading] = useState(false);
  const [degreesLoading, setDegreesLoading] = useState(false);
  const [signupListsError, setSignupListsError] = useState("");

  // Fetch signup lists
  useEffect(() => {
    if (isRegisterMode && (roleMode === "student" || roleMode === "mentor")) {
      setCollegesLoading(true); setSignupListsError("");
      axios.get("/api/admin/colleges").then((res) => {
        if (res.data.success) setColleges(res.data.data);
      }).catch(() => setSignupListsError("Failed to load colleges. Please try again."))
        .finally(() => setCollegesLoading(false));
    }
  }, [isRegisterMode, roleMode]);

  // Fetch degrees when college changes
  useEffect(() => {
    if (selectedCollege) {
      setDegreesLoading(true); setSignupListsError("");
      setSelectedDegree("");
      setSection("");
      setSemester("");
      setSelectedMentor("");
      setMentors([]);
      setMentorLookupMessage("");
      axios.get("/api/admin/degrees", { params: { collegeId: selectedCollege } }).then((res) => {
        if (res.data.success) setDegrees(res.data.data);
      }).catch(() => setSignupListsError("Failed to load degree programs. Please try again."))
        .finally(() => setDegreesLoading(false));
    } else {
      setDegrees([]);
      setSelectedDegree("");
      setSection("");
      setSemester("");
      setSelectedMentor("");
      setMentors([]);
      setMentorLookupMessage("");
      setDegreesLoading(false);
    }
  }, [selectedCollege]);

  useEffect(() => {
    if (!isRegisterMode || roleMode !== "student") return;

    setSelectedMentor("");
    setMentors([]);
    setMentorLookupMessage("");

    if (!selectedCollege || !selectedDegree) return;

    const controller = new AbortController();
    setMentorsLoading(true);

    axios
      .get("/api/mentors/list", {
        params: { collegeId: selectedCollege, courseId: selectedDegree },
        signal: controller.signal,
      })
      .then((res) => {
        const availableMentors = res.data.success ? res.data.data || [] : [];
        setMentors(availableMentors);
        if (availableMentors.length === 0) {
          const message = "No mentor is available for the selected college and degree. Please contact your college admin.";
          setMentorLookupMessage(message);
          toast.error(message);
        }
      })
      .catch((err) => {
        if (axios.isCancel(err)) return;
        setMentorLookupMessage("Failed to load mentors for this degree. Please try again.");
        toast.error("Failed to load mentors for this degree");
      })
      .finally(() => {
        setMentorsLoading(false);
      });

    return () => controller.abort();
  }, [isRegisterMode, roleMode, selectedCollege, selectedDegree]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all credentials");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegisterMode) {
        if (roleMode === "mentor") {
          if (!selectedCollege || !selectedDegree) {
            toast.error("Please select college and degree");
            setIsSubmitting(false);
            return;
          }

          // Register mentor
          const assignedClasses = assignedClassesInput
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c !== "");

          await register({
            name,
            email,
            password,
            role: "mentor",
            assignedClasses,
            department,
            collegeId: selectedCollege,
            assignedCourseId: selectedDegree,
          });
          toast.success("Mentor account registered successfully! Pending administrator approval.");
          setIsRegisterMode(false);
        } else if (roleMode === "student") {
          if (!selectedCollege || !selectedDegree || !section || !semester || !selectedMentor) {
            toast.error("Please select college, degree, section, semester, and mentor");
            setIsSubmitting(false);
            return;
          }

          // Check mentor capacity first
          const mentor = mentors.find((m) => m._id === selectedMentor);
          const mentorCapacity = mentor?.capacity || mentor?.maxStudents;
          if (mentor && mentor.assignedCount && mentorCapacity && mentor.assignedCount >= mentorCapacity) {
            toast.error("Mentor unavailable. Please select another mentor.");
            setIsSubmitting(false);
            return;
          }

          // Register student
          const res = await axios.post("/api/auth/student/signup", {
            name,
            email,
            rollNo,
            password,
            collegeId: selectedCollege,
            courseId: selectedDegree,
            section,
            semester: Number(semester),
            mentorId: selectedMentor,
          });
          if (res.data.success) {
            toast.success("Verification OTP code sent to your email!");
            setShowOtpScreen(true);
          }
        }
      } else {
        // Sign In
        await login(email, password);
        toast.success("Welcome back!");
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Operation failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/api/auth/student/verify-otp", {
        email,
        otp: otpCode,
      });
      if (res.data.success) {
        toast.success("Verification completed! Pending mentor approval.");
        setShowOtpScreen(false);
        setIsRegisterMode(false);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "OTP verification failed");
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setIsSubmitting(true);
    try {
      await loginWithGoogle(credential);
      toast.success("Welcome back!");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Google login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f8f9fa] p-4 font-sans">
      <div className="flex w-full max-w-5xl overflow-hidden rounded-2xl border border-[#dadce0] bg-white shadow-lg h-[90vh] md:h-[650px]">
        {/* Left Side Panel (Minimal Google Style) */}
        <div className="relative hidden w-3/5 flex-col justify-between bg-primary p-12 text-white md:flex">
          <div className="h-10 w-44 overflow-hidden rounded-lg bg-white">
            <img src={eduGuardBrand} alt="EduGuard" className="h-full w-full object-cover" />
          </div>

          <div className="my-auto flex flex-col items-center">
            <div className="relative mb-6 flex h-36 w-36 items-center justify-center rounded-full bg-white/10 ring-4 ring-white/5">
              <img src={eduGuardLogo} alt="" className="h-24 w-24 rounded-[22%] object-cover" />
            </div>
            <h1 className="text-center text-xl font-semibold tracking-wide">EduGuard: Multi-College Student Success Portal</h1>
            <p className="mt-2 text-center text-sm font-medium text-white/80 max-w-sm">
              Scalable administration, AI Study Planners, and academic tracking directories built for modern educational environments.
            </p>
          </div>

          <div className="text-xs font-medium text-white/80">
            &ldquo;Helping colleges monitor risk & intervene early.&rdquo;
          </div>
        </div>

        {/* Right Side Form Panel */}
        <div className="flex w-full flex-col px-8 py-10 md:w-2/5 md:px-12 overflow-y-auto">
          <div className="my-auto w-full">
          {/* Logo for mobile */}
          <div className="mb-6 h-10 w-44 overflow-hidden md:hidden">
            <img src={eduGuardBrand} alt="EduGuard" className="h-full w-full object-cover" />
          </div>

          {/* OTP Screen */}
          {showOtpScreen ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-[#202124]">Verify OTP Code</h2>
                <p className="text-xs text-[#5f6368] mt-1">We have sent a 6-digit security code to {email}. Please verify to confirm registration.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Enter Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <button type="submit" className="w-full bg-primary text-white py-2 rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors">
                Verify Account
              </button>
            </form>
          ) : (
            <>
              {/* Role Select Tabs */}
              <div className="flex rounded-lg bg-slate-100 p-1 mb-6 border border-slate-200/50">
                {(["mentor", "student", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRoleMode(r);
                      setIsRegisterMode(false);
                    }}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold capitalize transition-all ${
                      roleMode === r
                        ? "bg-white text-primary shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <div>
                <h2 className="text-xl font-semibold text-[#202124]">
                  {isRegisterMode ? `Sign Up as ${roleMode}` : `${roleMode} Sign In`}
                </h2>
                <p className="text-xs text-[#5f6368] mt-0.5">
                  {isRegisterMode ? "Configure profile parameters" : "Sign in to access workspace"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4 pb-8">
                {isRegisterMode && (
                  <div>
                    <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Ashish Kapoor"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="name@college.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>

                {isRegisterMode && roleMode === "student" && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Roll Number</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. BCA-2026-001"
                        value={rollNo}
                        onChange={(e) => setRollNo(e.target.value)}
                        className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Select College</label>
                      <select
                        required
                        value={selectedCollege}
                        onChange={(e) => setSelectedCollege(e.target.value)}
                        className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                      >
                        <option value="">{collegesLoading ? "Loading colleges..." : "Choose College..."}</option>
                        {colleges.map((c) => (
                          <option key={c._id} value={c._id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Select Degree Program</label>
                      <select
                        required
                        value={selectedDegree}
                        onChange={(e) => { setSelectedDegree(e.target.value); setSemester(""); }}
                        className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                      >
                        <option value="">{degreesLoading ? "Loading degrees..." : "Choose Degree..."}</option>
                        {degrees.map((d) => (
                          <option key={d._id} value={d._id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Section</label>
                        <select
                          required
                          value={section}
                          onChange={(e) => setSection(e.target.value)}
                          className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                        >
                          <option value="">Choose...</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Semester</label>
                        <select
                          required
                          value={semester}
                          onChange={(e) => setSemester(e.target.value)}
                          disabled={!selectedDegree}
                          className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none bg-white disabled:bg-slate-50"
                        >
                          <option value="">Choose...</option>
                          {Array.from({ length: (degrees.find((d) => d._id === selectedDegree)?.durationYears || 0) * 2 }, (_, i) => i + 1).map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Select Mentor</label>
                      <select
                        required
                        value={selectedMentor}
                        onChange={(e) => setSelectedMentor(e.target.value)}
                        disabled={!selectedCollege || !selectedDegree || mentorsLoading || mentors.length === 0}
                        className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                      >
                        <option value="">
                          {!selectedCollege || !selectedDegree
                            ? "Choose college and degree first..."
                            : mentorsLoading
                              ? "Loading mentors..."
                              : mentors.length === 0
                                ? "No mentor available"
                                : "Choose Mentor..."}
                        </option>
                        {mentors.map((m) => (
                          <option key={m._id} value={m._id}>
                            {m.name} ({m.assignedCount ?? 0}/{m.capacity || m.maxStudents || 50})
                          </option>
                        ))}
                      </select>
                      {mentorLookupMessage && (
                        <p className="mt-1 text-[11px] font-medium text-red-600">{mentorLookupMessage}</p>
                      )}
                    </div>
                  </>
                )}

                {isRegisterMode && roleMode === "mentor" && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Select College</label>
                      <select
                        required
                        value={selectedCollege}
                        onChange={(e) => setSelectedCollege(e.target.value)}
                        className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                      >
                        <option value="">{collegesLoading ? "Loading colleges..." : "Choose College..."}</option>
                        {colleges.map((c) => (
                          <option key={c._id} value={c._id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Select Degree Program</label>
                      <select
                        required
                        value={selectedDegree}
                        onChange={(e) => setSelectedDegree(e.target.value)}
                        disabled={!selectedCollege}
                        className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none bg-white disabled:bg-slate-50"
                      >
                        <option value="">{degreesLoading ? "Loading degrees..." : selectedCollege ? "Choose Degree..." : "Choose college first..."}</option>
                        {degrees.map((d) => (
                          <option key={d._id} value={d._id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Assigned Classes</label>
                      <input
                        type="text"
                        placeholder="e.g. BCA-A, BCA-B"
                        value={assignedClassesInput}
                        onChange={(e) => setAssignedClassesInput(e.target.value)}
                        className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-1">Department</label>
                      <input
                        type="text"
                        placeholder="e.g. Computer Applications"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {signupListsError && isRegisterMode && <p role="alert" className="text-xs font-medium text-red-600">{signupListsError}</p>}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 mt-2"
                >
                  {isSubmitting ? "Processing..." : isRegisterMode ? "Sign Up" : "Sign In"}
                </button>
              </form>

              {!isRegisterMode && roleMode === "student" && import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                <div className="pb-2">
                  <div className="mb-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div className="flex justify-center">
                    <GoogleSignInButton onCredential={handleGoogleCredential} disabled={isSubmitting} />
                  </div>
                  <p className="mt-2 text-center text-[11px] text-slate-500">
                    Available only after your college roster or mentor approval.
                  </p>
                </div>
              )}

              {roleMode !== "admin" && (
                <div className="mt-4 text-center text-xs font-semibold">
                  <span className="text-[#5f6368]">
                    {isRegisterMode ? "Already registered? " : "Don't have an account? "}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsRegisterMode(!isRegisterMode)}
                    className="text-primary hover:underline"
                  >
                    {isRegisterMode ? "Sign In" : "Sign Up"}
                  </button>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
