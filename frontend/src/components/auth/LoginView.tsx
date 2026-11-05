import React, { useState, useEffect, useCallback } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { apiRequest } from "../../services/apiClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faLock,
  faEye,
  faEyeSlash,
  faCircleExclamation,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { BrandLogo } from "../common/BrandLogo";
import { LoginIllustrationScene } from "./LoginIllustrationScene";
import { useCharacterAnimation } from "./useCharacterAnimation";
import { CharacterState } from "./BlobCharacter";

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
  const { login, sessionExpiredMessage, clearSessionExpiredMessage, remainingLoginAttempts } = useCollegeOS();
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

  const {
    state,
    pointerPosition,
    reducedMotion,
    setFieldFocus,
    setPasswordVisible,
    setSubmitting,
    setAuthResult,
    handlePointerMove,
    handlePointerLeave,
    sceneRef,
  } = useCharacterAnimation();

  useEffect(() => {
    if (transitioning) {
      setAuthResult("success");
      const timer = setTimeout(() => {
        onTransitionComplete?.();
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setAuthResult(null);
    }
  }, [transitioning, setAuthResult, onTransitionComplete]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (isSubmitting) return;
      setErrorMessage("");
      setIsSubmitting(true);
      setSubmitting(true);

      try {
        const success = await login(email.trim(), password, onLoginSuccess || undefined);
        if (!success) {
          setErrorMessage(
            "Invalid institutional credentials. Check your email address and password.",
          );
          setAuthResult("error");
        } else {
          setAuthResult("success");
        }
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Authentication error. Please try again.",
        );
        setAuthResult("error");
      } finally {
        setIsSubmitting(false);
        setSubmitting(false);
      }
    },
    [email, password, login, onLoginSuccess, isSubmitting, setSubmitting, setAuthResult],
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
        const result = await apiRequest<{ message: string }>(
          "/auth/forgot-password",
          {
            method: "POST",
            body: JSON.stringify({ email: normalizedEmail }),
          },
        );
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

  const handleEmailChange = useCallback((value: string) => {
    setEmail(value);
  }, []);

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
  }, []);

  const handleEmailFocus = useCallback(() => {
    setFieldFocus("email");
  }, [setFieldFocus]);

  const handlePasswordFocus = useCallback(() => {
    setFieldFocus("password");
  }, [setFieldFocus]);

  const handleEmailBlur = useCallback(() => {
    setFieldFocus(null);
  }, [setFieldFocus]);

  const handlePasswordBlur = useCallback(() => {
    setFieldFocus(null);
  }, [setFieldFocus]);

  const handleShowPasswordToggle = useCallback(() => {
    const newValue = !showPassword;
    setShowPassword(newValue);
    setPasswordVisible(newValue);
  }, [showPassword, setPasswordVisible]);

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center bg-slate-100 px-4 py-10"
      style={{ background: "radial-gradient(ellipse at center, #f8fafc 0%, #eef2f7 100%)" }}
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      role="main"
    >
      {/* Transition overlay */}
      {transitioning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-white transition-opacity duration-700"
          aria-label="Signing in"
          role="status"
        >
          <div className="flex flex-col items-center gap-3 text-slate-600">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span className="text-sm font-medium">Signing you in…</span>
          </div>
        </div>
      )}

      {/* Main login card - split screen */}
      <div
        className="relative w-full max-w-5xl rounded-2xl overflow-hidden shadow-[0_24px_48px_-12px_rgba(15,23,42,0.18)] border border-slate-200/60 bg-white"
        style={{
          boxShadow: `
            0 4px 24px -4px rgba(15, 23, 42, 0.08),
            0 24px 48px -12px rgba(15, 23, 42, 0.18)
          `,
          transform: reducedMotion || transitioning
            ? "none"
            : "perspective(1000px) rotateY(-1deg)",
          transition: reducedMotion
            ? "none"
            : "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        data-testid="login-card"
      >
        {/* Session-expired notice */}
        {sessionExpiredMessage && (
          <Alert variant="error" onDismiss={clearSessionExpiredMessage}>
            {sessionExpiredMessage}
          </Alert>
        )}

        {/* Desktop split layout */}
        <div className="hidden lg:flex lg:w-full lg:min-h-[520px]">
          {/* Left: Illustration Panel */}
          <div
            ref={sceneRef}
            className="relative lg:w-1/2 flex items-center justify-center p-8 lg:p-12 min-h-[520px]"
            style={{
              background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%)",
            }}
            onMouseMove={handlePointerMove}
            onMouseLeave={handlePointerLeave}
          >
            <LoginIllustrationScene
              state={state}
              pointerPosition={pointerPosition}
              reducedMotion={reducedMotion}
            />
          </div>

          {/* Right: Authentication Panel */}
          <div className="relative lg:w-1/2 flex items-center justify-center p-8 lg:p-12 min-h-[520px] bg-white">
            <div className="w-full max-w-md">
              <AuthForm
                email={email}
                password={password}
                showPassword={showPassword}
                errorMessage={errorMessage}
                isSubmitting={isSubmitting}
                remainingLoginAttempts={remainingLoginAttempts}
                onEmailChange={handleEmailChange}
                onPasswordChange={handlePasswordChange}
                onShowPasswordToggle={handleShowPasswordToggle}
                onSubmit={handleSubmit}
                onForgotPasswordClick={() => setShowForgotPassword(true)}
                onEmailFocus={handleEmailFocus}
                onPasswordFocus={handlePasswordFocus}
                onEmailBlur={handleEmailBlur}
                onPasswordBlur={handlePasswordBlur}
              />
            </div>
          </div>
        </div>

        {/* Mobile stacked layout */}
        <div className="lg:hidden flex flex-col min-h-[520px]">
          {/* Illustration on top */}
          <div
            ref={sceneRef}
            className="relative w-full flex items-center justify-center p-6 min-h-[280px] max-h-[320px]"
            style={{
              background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%)",
            }}
            onMouseMove={handlePointerMove}
            onMouseLeave={handlePointerLeave}
          >
            <LoginIllustrationScene
              state={state}
              pointerPosition={pointerPosition}
              reducedMotion={reducedMotion}
            />
          </div>

          {/* Form below */}
          <div className="relative w-full flex items-start justify-center p-6 lg:p-8 bg-white">
            <div className="w-full max-w-md">
              <AuthForm
                email={email}
                password={password}
                showPassword={showPassword}
                errorMessage={errorMessage}
                isSubmitting={isSubmitting}
                remainingLoginAttempts={remainingLoginAttempts}
                onEmailChange={handleEmailChange}
                onPasswordChange={handlePasswordChange}
                onShowPasswordToggle={handleShowPasswordToggle}
                onSubmit={handleSubmit}
                onForgotPasswordClick={() => setShowForgotPassword(true)}
                onEmailFocus={handleEmailFocus}
                onPasswordFocus={handlePasswordFocus}
                onEmailBlur={handleEmailBlur}
                onPasswordBlur={handlePasswordBlur}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
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
              <label
                htmlFor="recovery-email"
                className="cos-label"
              >
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
                  className="cos-input pl-11"
                />
              </div>
              {recoveryError && (
                <p
                  id="recovery-error"
                  role="alert"
                  className="cos-error flex items-center gap-1.5"
                >
                  <FontAwesomeIcon icon={faCircleExclamation} aria-hidden="true" />
                  <span>{recoveryError}</span>
                </p>
              )}
            </div>

            {recoveryMessage && (
              <Alert variant="info">{recoveryMessage}</Alert>
            )}

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                type="submit"
                isLoading={isRecoverySubmitting}
                loadingLabel="Submitting..."
                className="sm:flex-1"
              >
                Request Recovery
              </Button>
              <Button
                variant="secondary"
                onClick={closeRecovery}
                className="sm:flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

interface AuthFormProps {
  email: string;
  password: string;
  showPassword: boolean;
  errorMessage: string;
  isSubmitting: boolean;
  remainingLoginAttempts: number | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onShowPasswordToggle: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onForgotPasswordClick: () => void;
  onEmailFocus: () => void;
  onPasswordFocus: () => void;
  onEmailBlur: () => void;
  onPasswordBlur: () => void;
}

const AuthForm: React.FC<AuthFormProps> = ({
  email,
  password,
  showPassword,
  errorMessage,
  isSubmitting,
  remainingLoginAttempts,
  onEmailChange,
  onPasswordChange,
  onShowPasswordToggle,
  onSubmit,
  onForgotPasswordClick,
  onEmailFocus,
  onPasswordFocus,
  onEmailBlur,
  onPasswordBlur,
}) => {
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label="Sign in to CollegeOS">
      {/* Brand mark */}
      <div className="flex justify-center">
        <BrandLogo size={44} bordered className="rounded-2xl" />
      </div>

      {/* Heading */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Welcome back!</h1>
        <p className="mt-1.5 text-sm text-slate-500">Please enter your details.</p>
      </div>

      {/* Error message */}
      {errorMessage && (
        <Alert variant="error" className="cos-rise">
          {errorMessage}
        </Alert>
      )}

      {/* Email field */}
      <div>
        <Input
          label="Email address"
          icon={faEnvelope}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          onFocus={onEmailFocus}
          onBlur={onEmailBlur}
          placeholder="name@techspire.edu.np"
          error={errorMessage ? undefined : undefined}
          className="min-h-12 text-base"
        />
      </div>

      {/* Password field */}
      <div>
        <Input
          label="Password"
          icon={faLock}
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          onFocus={onPasswordFocus}
          onBlur={onPasswordBlur}
          placeholder="Enter password"
          trailing={
            <button
              type="button"
              onClick={onShowPasswordToggle}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="flex h-full items-center justify-center px-3 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <FontAwesomeIcon
                icon={showPassword ? faEyeSlash : faEye}
                className="text-base"
                aria-hidden="true"
              />
            </button>
          }
          className="min-h-12 text-base"
        />
        <div className="mt-2 flex items-center justify-end gap-3">
          <span className="text-xs text-slate-400">Case sensitive</span>
          <button
            type="button"
            onClick={onForgotPasswordClick}
            className="text-sm font-semibold text-slate-700 underline-offset-4 hover:underline transition-colors"
          >
            Forgot Password?
          </button>
        </div>
      </div>

             {/* Remaining attempts */}
       {remainingLoginAttempts !== null && (
         <p className={`text-sm ${remainingLoginAttempts <= 2 ? "text-red-600" : remainingLoginAttempts <= 5 ? "text-amber-600" : "text-slate-500"}`}>
           {remainingLoginAttempts} attempt{remainingLoginAttempts === 1 ? "" : "s"} remaining
          </p>
        )}
      <Button
        type="submit"
        fullWidth
        size="lg"
        disabled={isSubmitting}
        isLoading={isSubmitting}
        loadingLabel="Verifying credentials..."
        className="rounded-full cos-lift"
        icon={faArrowRight}
        iconPosition="right"
      >
        Log In
      </Button>

      {/* Google OAuth - only if configured */}
      <GoogleSignInButton />
    </form>
  );
};

const GoogleSignInButton: React.FC = () => {
  // Google OAuth is not currently configured in CollegeOS
  // This component returns null to avoid showing a non-functional button
  // When Google OAuth is configured, replace this with the actual implementation
  return null;
};

export default LoginView;