import React from "react";
import { Badge } from "../ui/Badge";
import { ATTENDANCE_STATUS_LABELS, attendanceStatusVariant } from "./attendanceRecordsTypes";

export const AttendanceStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const label = ATTENDANCE_STATUS_LABELS[status] ?? status;
  return (
    <Badge variant={attendanceStatusVariant(status)} size="sm">
      {label}
    </Badge>
  );
};

export default AttendanceStatusBadge;
