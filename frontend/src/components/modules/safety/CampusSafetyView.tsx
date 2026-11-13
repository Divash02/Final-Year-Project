import React from "react";
import { useToast } from "../../../components/ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { AdminIncidentWorkspaceView } from "./AdminIncidentWorkspaceView";
import { StudentIncidentReportsView } from "./StudentIncidentReportsView";

export const CampusSafetyView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();

  const isStudent = currentUser?.roles?.includes("student") || currentUser?.role === "student";

  const canManage = ["super_admin", "campus_admin", "dean", "hod", "program_coordinator", "registrar", "security_staff"].some((r) => currentUser?.roles?.includes(r) || currentUser?.role === r);

  if (isStudent) {
    return <StudentIncidentReportsView />;
  }

  if (canManage) {
    return <AdminIncidentWorkspaceView />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Campus Safety &amp; Security</h2>
        <p className="text-gray-500 mt-1">
          You do not have permission to view the incident management workspace.
          Contact your administrator if you believe this is an error.
        </p>
      </div>
    </div>
  );
};
