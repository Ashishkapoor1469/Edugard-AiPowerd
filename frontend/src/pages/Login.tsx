import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import toast from "react-hot-toast";

const Login: React.FC = () => {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [roleMode, setRoleMode] = useState<"mentor" | "student">("mentor");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [assignedClassesInput, setAssignedClassesInput] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (isRegisterMode && !name)) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegisterMode && roleMode === "mentor") {
        // Parse comma-separated assigned classes
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
        });
        toast.success("Mentor account registered successfully!");
      } else {
        await login(email, password);
        toast.success("Welcome back!");
      }
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || (isRegisterMode ? "Registration failed" : "Invalid credentials"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-indigo-50/30 p-4">
      <div className="flex w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl md:h-[650px]">
        {/* Left Side: Graphic Panel (60% width) */}
        <div className="relative hidden w-3/5 flex-col justify-between bg-primary p-12 text-white md:flex">
          {/* Logo element */}
          <div className="flex items-center gap-2">
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v6h2v-6zm0 8h-2v2h2v-2z" />
            </svg>
            <span className="text-xl font-bold tracking-tight">EduGuard</span>
          </div>

          {/* Decorative graphic illustration */}
          <div className="my-auto flex flex-col items-center">
            {/* abstract shield + dashboard graphic using CSS and SVGs */}
            <div className="relative mb-6 flex h-40 w-40 items-center justify-center rounded-full bg-white/10 ring-8 ring-white/5">
              <svg className="h-20 w-20 text-white animate-pulse-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {/* orbiting stats dots */}
              <span className="absolute left-4 top-4 h-4 w-4 rounded-full bg-emerald-400" />
              <span className="absolute right-4 bottom-4 h-4 w-4 rounded-full bg-amber-400" />
              <span className="absolute right-2 top-10 h-3 w-3 rounded-full bg-red-400" />
            </div>
            <h2 className="text-center text-2xl font-bold tracking-wide">EduGuard AI Analytics</h2>
            <p className="mt-2 text-center text-sm font-medium text-indigo-100 max-w-sm">
              Helping colleges monitor risk, performance metrics, and intervene early for better outcomes.
            </p>
          </div>

          <div className="text-xs font-semibold text-indigo-200">
            &ldquo;Early intervention. Better outcomes.&rdquo;
          </div>
        </div>

        {/* Right Side: Login/Signup Card (40% width) */}
        <div className="flex w-full flex-col justify-center px-8 py-10 md:w-2/5 md:px-12 overflow-y-auto">
          {/* Logo for mobile */}
          <div className="flex items-center gap-2 mb-4 md:hidden">
            <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v6h2v-6zm0 8h-2v2h2v-2z" />
            </svg>
            <span className="text-lg font-bold tracking-tight text-primary">EduGuard</span>
          </div>

          {/* Portal Role Selector Tab */}
          <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setRoleMode("mentor");
                setIsRegisterMode(false);
              }}
              className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-all ${
                roleMode === "mentor"
                  ? "bg-white text-primary shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Mentor Portal
            </button>
            <button
              type="button"
              onClick={() => {
                setRoleMode("student");
                setIsRegisterMode(false);
              }}
              className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-all ${
                roleMode === "student"
                  ? "bg-white text-primary shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Student Portal
            </button>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              {roleMode === "student"
                ? "Student Sign In"
                : isRegisterMode
                ? "Create Mentor Account"
                : "Mentor Sign In"}
            </h1>
            <p className="mt-1 text-xs font-medium text-secondary">
              {roleMode === "student"
                ? "Access your student metrics and profile"
                : isRegisterMode
                ? "Register a new mentor profile"
                : "Sign in to your mentor dashboard"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            {/* Name Input (Register Mode Only, Mentors Only) */}
            {isRegisterMode && roleMode === "mentor" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-secondary uppercase tracking-wider">Full Name</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Dr. John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm text-text-primary focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                    required={isRegisterMode}
                  />
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                </div>
              </div>
            )}

            {/* Email Input */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-secondary uppercase tracking-wider">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  placeholder={roleMode === "student" ? "student@college.edu" : "name@college.edu"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm text-text-primary focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                  required
                />
                <span className="absolute left-3 top-3 text-slate-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.206" />
                  </svg>
                </span>
              </div>
            </div>

            {/* Password Input */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-secondary uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-10 text-sm text-text-primary focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                  required
                />
                <span className="absolute left-3 top-3 text-slate-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-text-primary"
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Assigned Classes Input (Register Mode Only, Mentors Only) */}
            {isRegisterMode && roleMode === "mentor" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-secondary uppercase tracking-wider">Assigned Classes</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="BCA-A, BCA-B"
                    value={assignedClassesInput}
                    onChange={(e) => setAssignedClassesInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm text-text-primary focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                  />
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">Comma-separated class sections (e.g. BCA-A, BTECH-B)</span>
              </div>
            )}

            {/* Remember Me & Forgot Password */}
            {!isRegisterMode && (
              <div className="flex items-center justify-between text-xs font-semibold">
                <label className="flex items-center gap-2 text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  Remember me
                </label>
                <button type="button" className="text-primary hover:underline">
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex w-full items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-100 hover:bg-primary-hover focus:outline-hidden focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
            >
              {isSubmitting ? (
                <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : isRegisterMode && roleMode === "mentor" ? (
                "Register Account"
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Toggle link between login & signup (Mentors Only) */}
          {roleMode === "mentor" && (
            <div className="mt-4 text-center text-xs font-semibold">
              <span className="text-secondary">
                {isRegisterMode ? "Already have a mentor account? " : "Don't have a mentor account? "}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  toast.dismiss();
                }}
                className="text-primary hover:underline"
              >
                {isRegisterMode ? "Sign In" : "Sign Up"}
              </button>
            </div>
          )}

          {/* Bottom Note */}
          <div className="mt-6 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            EduGuard — Helping colleges intervene early
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
