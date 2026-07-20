import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import eduGuardLogo from "../assets/e.png";
import eduGuardBrand from "../assets/e-witheduguardtext.png";

const Verify: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token || !email) {
      setErrorMsg("Invalid activation link. Missing token or email parameter.");
    }
  }, [token, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !email) {
      toast.error("Invalid activation parameters");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await axios.post("/api/auth/verify-set-password", {
        email,
        token,
        password,
      });

      if (res.data.success) {
        toast.success("Account activated successfully!");
        setSuccess(true);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || "Activation failed";
      toast.error(msg);
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary/10 via-white to-primary/5 p-4">
      <div className="flex w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl md:h-[600px]">
        {/* Left Side: Graphic Panel (60% width) */}
        <div className="relative hidden w-3/5 flex-col justify-between bg-primary p-12 text-white md:flex">
          {/* Logo element */}
          <div className="h-10 w-44 overflow-hidden rounded-lg bg-white">
            <img src={eduGuardBrand} alt="EduGuard" className="h-full w-full object-cover" />
          </div>

          {/* Decorative graphic illustration */}
          <div className="my-auto flex flex-col items-center">
            <div className="relative mb-6 flex h-40 w-40 items-center justify-center rounded-full bg-white/10 ring-8 ring-white/5">
              <img src={eduGuardLogo} alt="" className="h-28 w-28 rounded-[22%] object-cover" />
              <span className="absolute left-4 top-4 h-4 w-4 rounded-full bg-emerald-400" />
              <span className="absolute right-4 bottom-4 h-4 w-4 rounded-full bg-primary/20" />
            </div>
            <h2 className="text-center text-2xl font-bold tracking-wide">Account Activation</h2>
            <p className="mt-2 text-center text-sm font-medium text-white/80 max-w-sm">
              Setup a password to activate your student portal. You will be able to access your attendance, marks, and chat with your mentor.
            </p>
          </div>

          <div className="text-xs font-semibold text-white/80">
            &ldquo;Security and privacy is our priority.&rdquo;
          </div>
        </div>

        {/* Right Side: Form Card (40% width) */}
        <div className="flex w-full flex-col justify-center px-8 py-10 md:w-2/5 md:px-12">
          {/* Logo for mobile */}
          <div className="mb-6 h-10 w-44 overflow-hidden md:hidden">
            <img src={eduGuardBrand} alt="EduGuard" className="h-full w-full object-cover" />
          </div>

          {errorMsg && !success ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-4">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-text-primary">Activation Error</h2>
              <p className="mt-2 text-sm text-slate-500">{errorMsg}</p>
              <button
                onClick={() => navigate("/login")}
                className="mt-6 w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary-hover"
              >
                Go to Login
              </button>
            </div>
          ) : success ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-4">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-text-primary">Account Activated!</h2>
              <p className="mt-2 text-sm text-slate-500">
                Your password has been successfully configured. You can now access your EduGuard dashboard.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="mt-6 w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary-hover shadow-md shadow-primary/10"
              >
                Sign In
              </button>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Set Password</h1>
              <p className="mt-1 text-xs font-medium text-secondary">
                Activate account for <span className="font-semibold text-primary">{email}</span>
              </p>

              <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
                {/* Password Input */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-secondary uppercase tracking-wider">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-10 text-sm text-text-primary focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/15"
                      required
                    />
                    <span className="absolute left-3 top-3 text-slate-400">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Confirm Password Input */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-secondary uppercase tracking-wider">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-10 text-sm text-text-primary focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/15"
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

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-6 flex w-full items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary-hover shadow-md shadow-primary/10 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    "Activate Account"
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Bottom Note */}
          <div className="mt-8 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            EduGuard — Secure Portal Activation
          </div>
        </div>
      </div>
    </div>
  );
};

export default Verify;
