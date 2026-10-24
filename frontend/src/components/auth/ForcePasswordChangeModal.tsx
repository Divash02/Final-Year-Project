import React, { useCallback, useState } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faCircleExclamation,
  faKey,
  faLock,
  faShieldHalved,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  PASSWORD_REQUIREMENTS,
  PASSWORD_STRENGTH_LABELS,
  PasswordStrengthScore,
  scorePasswordStrength,
  validatePassword,
} from "../../lib/passwordPolicy";

type ApiError = Error & {
  code?: string;
  details?: Array<{ field: string; message: string }>;
};

const STRENGTH_COLORS: Record<PasswordStrengthScore["strength"], string> = {
  "very-weak": "bg-red-500",
  weak: "bg-orange-500",
  fair: "bg-amber-400",
  good: "bg-emerald-400",
  strong: "bg-emerald-500",
};

export const ForcePasswordChangeModal: React.FC = () => {
  const { changePassword, currentUser, logout } = useCollegeOS();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | React.ReactNode>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = useCallback(() => {
    void logout();
  }, [logout]);

  const policy = validatePassword(newPassword);
  const strength: PasswordStrengthScore = scorePasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!policy.valid) {
      setError(
        <div className="text-left">
          <div className="font-semibold">Password does not meet requirements.</div>
          <ul className="mt-1 list-disc list-inside space-y-0.5">
            {policy.errors.map((err) => (
              <li key={err.message}>{err.message}</li>
            ))}
          </ul>
        </div>,
      );
      return;
    }

    if (newPassword === currentPassword) {
      setError("New password must differ from the current password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please verify the confirmation.");
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err) {
      const apiError = err as ApiError;
      const message = apiError?.message || "Failed to update password.";
      const details = apiError?.details ?? [];
      setError(
        <div className="text-left">
          <div className="font-semibold">{message}</div>
          {details.length > 0 && (
            <ul className="mt-1 list-disc list-inside space-y-0.5">
              {details.map((d) => (
                <li key={d.message}>{d.message}</li>
              ))}
            </ul>
          )}
        </div>,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={handleClose}
      title="Mandatory Password Update"
      subtitle="Update your temporary credential to continue"
      maxWidth="md"
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-white text-sm text-slate-800"
      >
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <FontAwesomeIcon icon={faShieldHalved} className="text-amber-600" />
            <span>First-Login Security Verification</span>
          </div>
          <p className="mt-2">
            You are signed in as{" "}
            <span className="font-bold text-slate-900">
              {currentUser?.email}
            </span>
            . Set a personal password before continuing.
          </p>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <FontAwesomeIcon
              icon={faCircleExclamation}
              className="mt-0.5 shrink-0 text-red-500"
            />
            <span className="flex-1">{error}</span>
          </div>
        ) : null}

        <div>
          <label className="mb-1.5 block font-medium text-slate-700">
            Current Password *
          </label>
          <div className="relative">
            <FontAwesomeIcon
              icon={faLock}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-slate-900 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-medium text-slate-700">
            New Secure Password *
          </label>
          <div className="relative">
            <FontAwesomeIcon
              icon={faKey}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Set your personal password"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-slate-900 placeholder:text-slate-400 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>

          <div className="mt-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">
                Password strength:
              </span>
              <span
                className={`font-semibold ${
                  strength.score === 4
                    ? "text-emerald-600"
                    : strength.score >= 2
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {strength.label}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200">
              <div
                className={`h-1.5 rounded-full transition-all duration-200 ${STRENGTH_COLORS[strength.strength]}`}
                style={{
                  width: `${Math.max(10, (strength.score / 4) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            {PASSWORD_REQUIREMENTS.map((req) => {
              const ok = req.test(newPassword);
              const icon: IconDefinition = ok ? faCheck : faXmark;
              const iconClass = ok
                ? "text-emerald-600"
                : "text-slate-400";
              return (
                <div key={req.id} className="flex items-center gap-2 text-xs">
                  <FontAwesomeIcon icon={icon} className={iconClass} />
                  <span className={ok ? "text-emerald-700" : "text-slate-500"}>
                    {req.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-medium text-slate-700">
            Confirm New Password *
          </label>
          <div className="relative">
            <FontAwesomeIcon
              icon={faLock}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Re-enter password"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-slate-900 placeholder:text-slate-400 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <span className="font-medium">
            Your password must meet the requirements above.
          </span>
          <span className="text-slate-400">
            {newPassword.length} character{newPassword.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-2">
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            disabled={isSubmitting || !policy.valid}
          >
            Establish Password & Continue
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ForcePasswordChangeModal;
