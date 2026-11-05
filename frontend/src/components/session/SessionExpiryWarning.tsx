import React, { useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShieldHalved,
  faSignOutAlt,
} from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export interface SessionExpiryWarningProps {
  secondsRemaining: number;
  onStaySignedIn: () => void;
  onSignOutNow: () => void;
  renewing: boolean;
}

const formatCountdown = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

export const SessionExpiryWarning: React.FC<SessionExpiryWarningProps> = ({
  secondsRemaining,
  onStaySignedIn,
  onSignOutNow,
  renewing,
}) => {
  const handleStaySignedIn = useCallback(() => {
    onStaySignedIn();
  }, [onStaySignedIn]);

  /**
   * Deliberately no-op: the user must explicitly stay signed in or sign out.
   * Letting Escape or the backdrop dismiss the modal would bypass the
   * security policy.
   */
  const handleDismiss = useCallback(() => {
    // Intentionally ignored.
  }, []);

  return (
    <Modal
      isOpen
      onClose={handleDismiss}
      title="Your session is about to expire"
      subtitle="For security purposes, you will be automatically signed out due to inactivity."
      maxWidth="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Your session will expire in{" "}
          <span
            aria-live="polite"
            data-testid="session-countdown"
            className="font-mono font-semibold text-slate-900"
          >
            {formatCountdown(secondsRemaining)}
          </span>
          .
        </p>
        <Alert variant="warning" className="mt-2">
          Save or submit any unfinished work before signing out if you need to
          keep it.
        </Alert>
      </div>
      <div className="flex flex-col sm:flex-row sm:justify-end gap-3 w-full">
        <Button
          variant="danger"
          onClick={onSignOutNow}
          className="w-full sm:w-auto"
          icon={faSignOutAlt}
          iconPosition="left"
        >
          Sign Out Now
        </Button>
        <Button
          disabled={renewing}
          isLoading={renewing}
          loadingLabel="Renewing session…"
          onClick={handleStaySignedIn}
          className="w-full sm:w-auto"
          icon={faShieldHalved}
          iconPosition="left"
        >
          Stay Signed In
        </Button>
      </div>
    </Modal>
  );
};

export default SessionExpiryWarning;
