import React, { useCallback, useEffect, useState } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { apiRequest } from "../../services/apiClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faCircleExclamation,
  faEnvelope,
  faEye,
  faEyeSlash,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { BrandLogo, BRAND_LOGO_SRC } from "../common/BrandLogo";

export interface LoginViewProps {
  transitioning?: boolean;
  onTransitionComplete?: () => void;
  onLoginSuccess?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({
  transitioning = false,
  onTransitionComplete,
  onLoginSuccess,
}) => {
  const {
    login,
    sessionExpiredMessage,
    clearSessionExpiredMessage,
    remainingLoginAttempts,
  } = useCollegeOS();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);

  useEffect(() => {
    if (!transitioning || !onTransitionComplete) return;
    const timer = window.setTimeout(onTransitionComplete, 700);
    return () => window.clearTimeout(timer);
  }, [transitioning, onTransitionComplete]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (isSubmitting) return;
      setErrorMessage("");
      setIsSubmitting(true);
      try {
        const success = await login(email.trim(), password, onLoginSuccess || undefined);
        if (!success) {
          setErrorMessage(
            "Invalid institutional credentials. Check your email address and password.",
          );
        }
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : "Authentication error. Please try again.",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, login, onLoginSuccess, isSubmitting],
  );

  const handleRecoveryRequest = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const normalizedEmail = recoveryEmail.trim().toLowerCase();
      setRecoveryError("");
      if (!normalizedEmail.includes("@")) {
        setRecoveryError("Enter a valid institutional email address.");
        return;
      }
      setIsRecoverySubmitting(true);
      setRecoveryMessage("");
      try {
        const result = await apiRequest<{ message: string }>("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: normalizedEmail }),
        });
        setRecoveryMessage(result.message);
      } catch (error) {
        setRecoveryError(
          error instanceof Error
            ? error.message
            : "Password recovery is currently unavailable.",
        );
      } finally {
        setIsRecoverySubmitting(false);
      }
    },
    [recoveryEmail],
  );

  const closeRecovery = useCallback(() => {
    setShowForgotPassword(false);
    setRecoveryEmail("");
    setRecoveryMessage("");
    setRecoveryError("");
  }, []);

  return (
    <main
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-8 sm:px-6"
      style={{ background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 46%, #edf2f7 100%)" }}
    >
      <style>{`
        @keyframes loginBgFloatA { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(28px,-18px,0) scale(1.06); } }
        @keyframes loginBgFloatB { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-24px,22px,0) scale(1.05); } }
        @keyframes loginBgFloatC { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(16px,14px,0) scale(1.04); } }
        .login-bg-a { animation: loginBgFloatA 14s ease-in-out infinite; }
        .login-bg-b { animation: loginBgFloatB 18s ease-in-out infinite; }
        .login-bg-c { animation: loginBgFloatC 16s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .login-bg-a, .login-bg-b, .login-bg-c { animation: none; } }
      `}</style>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="login-bg-a absolute -left-[8%] top-[8%] h-[34rem] w-[34rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(175,35,27,0.10) 0%, rgba(175,35,27,0.03) 42%, transparent 70%)", filter: "blur(10px)" }} />
        <div className="login-bg-b absolute -right-[6%] top-[18%] h-[28rem] w-[28rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(133,26,21,0.08) 0%, rgba(133,26,21,0.025) 45%, transparent 72%)", filter: "blur(12px)" }} />
        <div className="login-bg-c absolute bottom-[-10%] left-[28%] h-[24rem] w-[24rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(148,163,184,0.14) 0%, rgba(148,163,184,0.04) 45%, transparent 72%)", filter: "blur(14px)" }} />
        <img
          src={BRAND_LOGO_SRC}
          alt=""
          draggable={false}
          className="absolute right-[-4%] top-1/2 h-[min(62vh,34rem)] w-auto -translate-y-1/2 select-none object-contain opacity-[0.045] sm:right-[2%] sm:opacity-[0.055]"
          style={{ filter: "grayscale(0.1)" }}
        />
      </div>
      {transitioning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/92 backdrop-blur-sm"
          aria-label="Signing in"
          role="status"
        >
          <div className="flex flex-col items-center gap-3 text-slate-600">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "#af231b", borderTopColor: "transparent" }}
            />
            <span className="text-sm font-medium">Signing you in…</span>
          </div>
        </div>
      )}

      <div
        className="relative z-10 w-full rounded-[28px] border border-white/70 bg-white/95 px-6 py-8 shadow-[0_28px_70px_-38px_rgba(15,23,42,0.42)] backdrop-blur-[2px] sm:px-10 sm:py-10"
        style={{ width: "min(440px, calc(100vw - 32px))" }}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[28px]"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)" }}
        />

        {sessionExpiredMessage && (
          <div className="mb-5">
            <Alert variant="error" onDismiss={clearSessionExpiredMessage}>
              {sessionExpiredMessage}
            </Alert>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          className="relative w-full"
          aria-label="Sign in to CollegeOS"
        >
          <div className="flex justify-center">
            <BrandLogo size={36} className="rounded-xl opacity-90" />
          </div>

          <div className="mt-4 text-center">
            <h1 className="text-[2rem] font-semibold tracking-tight text-slate-900">
              Welcome back!
            </h1>
            <p className="mt-2 text-[15px] leading-6 text-slate-500">
              Sign in to access your CollegeOS workspace.
            </p>
          </div>

          {errorMessage && (
            <div className="mt-5">
              <Alert variant="error" className="cos-rise">
                {errorMessage}
              </Alert>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <Input
              label="Email address"
              icon={faEnvelope}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@techspire.edu.np"
              wrapperClassName="[&_.cos-label]:text-[13px] [&_.cos-label]:font-semibold [&_.cos-label]:text-slate-700"
              className="min-h-[48px] rounded-xl border-slate-200 bg-white text-[15px] text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.02)] placeholder:text-slate-400 focus:border-[#af231b] focus:shadow-[0_0_0_4px_rgba(175,35,27,0.12)]"
            />

            <div>
              <Input
                label="Password"
                icon={faLock}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                wrapperClassName="[&_.cos-label]:text-[13px] [&_.cos-label]:font-semibold [&_.cos-label]:text-slate-700"
                className="min-h-[48px] rounded-xl border-slate-200 bg-white text-[15px] text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.02)] placeholder:text-slate-400 focus:border-[#af231b] focus:shadow-[0_0_0_4px_rgba(175,35,27,0.12)]"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="mr-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                  >
                    <FontAwesomeIcon
                      icon={showPassword ? faEyeSlash : faEye}
                      className="text-[15px]"
                      aria-hidden="true"
                    />
                  </button>
                }
              />
              <div className="mt-2.5 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">Case sensitive</span>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm font-semibold transition hover:underline"
                  style={{ color: "#851a15", textUnderlineOffset: "3px" }}
                >
                  Forgot password?
                </button>
              </div>
            </div>

            {remainingLoginAttempts !== null && (
              <p
                className={`text-sm ${
                  remainingLoginAttempts <= 2
                    ? "text-red-600"
                    : remainingLoginAttempts <= 5
                      ? "text-amber-600"
                      : "text-slate-500"
                }`}
              >
                {remainingLoginAttempts} attempt
                {remainingLoginAttempts === 1 ? "" : "s"} remaining
              </p>
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              disabled={isSubmitting}
              isLoading={isSubmitting}
              loadingLabel="Verifying credentials..."
              className="min-h-[50px] rounded-xl border-0 text-[15px] font-semibold text-white shadow-[0_14px_28px_-16px_rgba(175,35,27,0.75)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-16px_rgba(175,35,27,0.82)] active:translate-y-0"
              style={{ backgroundColor: "#af231b" }}
              icon={faArrowRight}
              iconPosition="right"
            >
              Log In
            </Button>
          </div>
        </form>
      </div>

      {showForgotPassword && (
        <Modal
          isOpen={true}
          onClose={closeRecovery}
          title="Password Recovery"
          subtitle="Request password recovery for your institutional account"
          maxWidth="md"
        >
          <form onSubmit={handleRecoveryRequest} noValidate className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-500">
              The registrar or IT office completes identity verification.
            </p>
            <div>
              <label htmlFor="recovery-email" className="cos-label">
                College email
              </label>
              <div className="relative">
                <FontAwesomeIcon
                  icon={faEnvelope}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="recovery-email"
                  name="recovery-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={recoveryEmail}
                  onChange={(event) => setRecoveryEmail(event.target.value)}
                  placeholder="name@techspire.edu.np"
                  aria-invalid={recoveryError ? true : undefined}
                  aria-describedby={recoveryError ? "recovery-error" : undefined}
                  className="cos-input min-h-[46px] rounded-xl border-slate-200 pl-11 focus:border-[#af231b] focus:shadow-[0_0_0_4px_rgba(175,35,27,0.12)]"
                />
              </div>
              {recoveryError && (
                <p id="recovery-error" role="alert" className="cos-error mt-2 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faCircleExclamation} aria-hidden="true" />
                  <span>{recoveryError}</span>
                </p>
              )}
            </div>
            {recoveryMessage && <Alert variant="info">{recoveryMessage}</Alert>}
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                type="submit"
                isLoading={isRecoverySubmitting}
                loadingLabel="Submitting..."
                className="sm:flex-1 rounded-xl border-0 text-white"
                style={{ backgroundColor: "#af231b" }}
              >
                Request Recovery
              </Button>
              <Button variant="secondary" onClick={closeRecovery} className="sm:flex-1 rounded-xl">
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
};

export default LoginView;
