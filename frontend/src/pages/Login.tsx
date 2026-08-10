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
  const { login, loginWithGoogle, completeGoogleProfile, register } = useAuth();
  const navigate = useNavigate();

  // Role selections: mentor, student, admin
  const [roleMode, setRoleMode] = useState<"mentor" | "student" | "admin">("mentor");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleFlow, setGoogleFlow] = useState<null | {
    credential: string;
    role: "mentor" | "student";
    state: "needs_approval_request" | "waiting_approval" | "account_inactive" | "profile_incomplete";
    message: string;
    name: string;
    email: string;
    collegeId?: string;
    mentorId?: string;
  }>(null);

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
    if ((isRegisterMode || googleFlow?.state === "needs_approval_request") && (roleMode === "student" || roleMode === "mentor")) {
      setCollegesLoading(true); setSignupListsError("");
      axios.get("/api/admin/colleges").then((res) => {
        if (res.data.success) setColleges(res.data.data);
      }).catch(() => setSignupListsError("Failed to load colleges. Please try again."))
        .finally(() => setCollegesLoading(false));
    }
  }, [isRegisterMode, roleMode, googleFlow?.state]);

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
    const isStudentSignup = isRegisterMode && roleMode === "student";
    const isStudentGoogleRequest = googleFlow?.state === "needs_approval_request" && googleFlow.role === "student";
    if (!isStudentSignup && !isStudentGoogleRequest) return;

    setSelectedMentor("");
    setMentors([]);
    setMentorLookupMessage("");

    if (!selectedCollege || (isStudentSignup && !selectedDegree)) return;

    const controller = new AbortController();
    setMentorsLoading(true);

    axios
      .get("/api/mentors/list", {
        params: { collegeId: selectedCollege, ...(isStudentSignup ? { courseId: selectedDegree } : {}) },
        signal: controller.signal,
      })
      .then((res) => {
        const availableMentors = res.data.success ? res.data.data || [] : [];
        setMentors(availableMentors);
        if (availableMentors.length === 0) {
          const message = isStudentSignup
            ? "No mentor is available for the selected college and degree. Please contact your college admin."
            : "No approved mentor is available for this college. Please contact your college admin.";
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
  }, [isRegisterMode, roleMode, selectedCollege, selectedDegree, googleFlow?.state, googleFlow?.role]);

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
      const googleRole = roleMode === "mentor" ? "mentor" : "student";
      const result = await loginWithGoogle(credential, googleRole);
      if (result.state === "authenticated") {
        toast.success("Welcome back!");
        navigate("/");
        return;
      }
      setName(result.data?.name || "");
      setSelectedCollege(result.data?.collegeId || "");
      setGoogleFlow({
        credential,
        role: googleRole,
        state: result.state,
        message: result.message || "Continue your Google account setup.",
        name: result.data?.name || "",
        email: result.data?.email || "",
        collegeId: result.data?.collegeId,
        mentorId: result.data?.mentorId,
      });
    } catch (err: any) {
      toast.error(err.message || "Google login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleApprovalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleFlow || !selectedCollege || (googleFlow.role === "student" && !selectedMentor)) {
      toast.error(googleFlow?.role === "student" ? "Select your college and approving mentor" : "Select your college");
      return;
    }
    setIsSubmitting(true);
    try {
      const { data } = await axios.post("/api/auth/google/request-approval", {
        credential: googleFlow.credential,
        role: googleFlow.role,
        collegeId: selectedCollege,
        mentorId: googleFlow.role === "student" ? selectedMentor : undefined,
      });
      setGoogleFlow({ ...googleFlow, state: "waiting_approval", message: data.message, collegeId: selectedCollege, mentorId: selectedMentor || undefined });
      toast.success("Approval request submitted");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Could not submit approval request");
    } finally { setIsSubmitting(false); }
  };

  const handleGoogleProfileCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleFlow || !selectedDegree) { toast.error("Select your degree"); return; }
    if (googleFlow.role === "student" && (!rollNo || !section || !semester)) { toast.error("Complete all student fields"); return; }
    setIsSubmitting(true);
    try {
      const result = await completeGoogleProfile(googleFlow.credential, googleFlow.role, {
        name,
        courseId: selectedDegree,
        department,
        assignedClasses: assignedClassesInput.split(",").map((item) => item.trim()).filter(Boolean),
        rollNo,
        section,
        semester: Number(semester || 0),
      });
      if (result.state === "authenticated") {
        toast.success("Profile completed. Welcome to EduGuard!");
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message || "Could not complete profile");
    } finally { setIsSubmitting(false); }
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

          {/* Google approval and profile-completion flow */}
          {googleFlow ? (
            <div className="space-y-5">
              <div>
                <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Google {googleFlow.role}</span>
                <h2 className="mt-3 text-xl font-semibold text-[#202124]">
                  {googleFlow.state === "needs_approval_request" ? "Request account approval" : googleFlow.state === "profile_incomplete" ? "Complete your profile" : googleFlow.state === "waiting_approval" ? "Waiting for approval" : "Account not active"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-[#5f6368]">{googleFlow.message}</p>
                <p className="mt-2 text-xs font-semibold text-slate-700">{googleFlow.name || googleFlow.email}<br /><span className="font-normal text-slate-500">{googleFlow.email}</span></p>
              </div>

              {googleFlow.state === "needs_approval_request" && (
                <form onSubmit={handleGoogleApprovalRequest} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f6368]">Select College</label>
                    <select required value={selectedCollege} onChange={(e) => setSelectedCollege(e.target.value)} className="w-full rounded-lg border border-[#dadce0] bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none">
                      <option value="">{collegesLoading ? "Loading colleges..." : "Choose College..."}</option>
                      {colleges.map((college) => <option key={college._id} value={college._id}>{college.name}</option>)}
                    </select>
                  </div>
                  {googleFlow.role === "student" && (
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f6368]">Approving Mentor</label>
                      <select required value={selectedMentor} onChange={(e) => setSelectedMentor(e.target.value)} disabled={!selectedCollege || mentorsLoading || mentors.length === 0} className="w-full rounded-lg border border-[#dadce0] bg-white px-3.5 py-2.5 text-sm disabled:bg-slate-50">
                        <option value="">{!selectedCollege ? "Choose college first..." : mentorsLoading ? "Loading mentors..." : mentors.length ? "Choose Mentor..." : "No mentor available"}</option>
                        {mentors.map((mentor) => <option key={mentor._id} value={mentor._id}>{mentor.name} ({mentor.assignedCount ?? 0}/{mentor.capacity || mentor.maxStudents || 50})</option>)}
                      </select>
                      {mentorLookupMessage && <p className="mt-1 text-[11px] font-medium text-red-600">{mentorLookupMessage}</p>}
                    </div>
                  )}
                  {signupListsError && <p role="alert" className="text-xs font-medium text-red-600">{signupListsError}</p>}
                  <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isSubmitting ? "Submitting..." : "Send Approval Request"}</button>
                </form>
              )}

              {googleFlow.state === "profile_incomplete" && (
                <form onSubmit={handleGoogleProfileCompletion} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f6368]">Full Name</label>
                    <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f6368]">Degree Program</label>
                    <select required value={selectedDegree} onChange={(e) => { setSelectedDegree(e.target.value); setSemester(""); }} className="w-full rounded-lg border border-[#dadce0] bg-white px-3.5 py-2.5 text-sm">
                      <option value="">{degreesLoading ? "Loading degrees..." : "Choose Degree..."}</option>
                      {degrees.map((degree) => <option key={degree._id} value={degree._id}>{degree.name}</option>)}
                    </select>
                  </div>
                  {googleFlow.role === "mentor" ? (
                    <>
                      <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f6368]">Department</label><input required value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Computer Applications" className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2.5 text-sm" /></div>
                      <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f6368]">Assigned Classes</label><input value={assignedClassesInput} onChange={(e) => setAssignedClassesInput(e.target.value)} placeholder="e.g. BCA-A, BCA-B" className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2.5 text-sm" /></div>
                    </>
                  ) : (
                    <>
                      <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f6368]">Roll Number</label><input required value={rollNo} onChange={(e) => setRollNo(e.target.value)} className="w-full rounded-lg border border-[#dadce0] px-3.5 py-2.5 text-sm" /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f6368]">Section</label><select required value={section} onChange={(e) => setSection(e.target.value)} className="w-full rounded-lg border border-[#dadce0] bg-white px-3.5 py-2.5 text-sm"><option value="">Choose...</option><option value="A">A</option><option value="B">B</option></select></div>
                        <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f6368]">Semester</label><select required value={semester} onChange={(e) => setSemester(e.target.value)} disabled={!selectedDegree} className="w-full rounded-lg border border-[#dadce0] bg-white px-3.5 py-2.5 text-sm disabled:bg-slate-50"><option value="">Choose...</option>{Array.from({ length: (degrees.find((degree) => degree._id === selectedDegree)?.durationYears || 0) * 2 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                      </div>
                    </>
                  )}
                  <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isSubmitting ? "Saving..." : "Complete Profile & Continue"}</button>
                </form>
              )}

              {(googleFlow.state === "waiting_approval" || googleFlow.state === "account_inactive") && (
                <div className={`rounded-xl border p-4 text-xs leading-5 ${googleFlow.state === "waiting_approval" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                  {googleFlow.state === "waiting_approval" ? `Sign in with Google again after your ${googleFlow.role === "mentor" ? "college administrator" : "mentor"} approves the request.` : "Contact the approving authority if you believe this status is incorrect."}
                </div>
              )}
              <button type="button" onClick={() => { setGoogleFlow(null); setSelectedCollege(""); setSelectedDegree(""); setSelectedMentor(""); }} className="w-full rounded-lg border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Back to Sign In</button>
            </div>
          ) : showOtpScreen ? (
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

              {!isRegisterMode && (roleMode === "mentor" || roleMode === "student") && import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                <div className="pb-2">
                  <div className="mb-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div className="flex justify-center">
                    <GoogleSignInButton onCredential={handleGoogleCredential} disabled={isSubmitting} />
                  </div>
                  <p className="mt-2 text-center text-[11px] text-slate-500">
                    {roleMode === "mentor"
                      ? "Available after your college administrator approves your mentor account."
                      : "Available only after your college roster or mentor approval."}
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
