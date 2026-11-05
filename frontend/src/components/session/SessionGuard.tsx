import React, { useEffect } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useSessionTimeout } from "../../hooks/useSessionTimeout";
import { SessionExpiryWarning } from "./SessionExpiryWarning";

/**
 * Renders the session expiry warning while the user is authenticated. The
 * warning is driven by the session timeout manager, which is itself enforced
 * by the backend on every request. Only one tab shows the warning at a time;
 * other tabs are synchronized through the session bus.
 */
export const SessionGuard: React.FC = () => {
  const { isAuthenticated } = useCollegeOS();
  const { state, renewing, staySignedIn, signOutNow } = useSessionTimeout();

  if (!isAuthenticated) return null;

  const warning = state.status === "warning" ? state : null;

  if (!warning) return null;

  return (
    <SessionExpiryWarning
      secondsRemaining={warning.secondsRemaining}
      renewing={renewing}
      onStaySignedIn={staySignedIn}
      onSignOutNow={signOutNow}
    />
  );
};

export default SessionGuard;
