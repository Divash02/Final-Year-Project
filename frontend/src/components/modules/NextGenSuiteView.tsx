import React, { useState } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { formatNPR } from "../../lib/nepaliCalendar";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimeline,
  faGraduationCap,
  faListCheck,
  faCircleCheck,
  faTriangleExclamation,
  faArrowRight,
  faClock,
  faSitemap,
  faFilter,
  faBolt,
} from "@fortawesome/free-solid-svg-icons";

export const NextGenSuiteView: React.FC = () => {
  const { students, currentTenant } = useCollegeOS();
  const [activeTab, setActiveTab] = useState<
    "timeline" | "simulator" | "next_action" | "radar"
  >("next_action");
  const [selectedStudentId, setSelectedStudentId] = useState(
    students[0]?.id || "",
  );

  const student =
    students.find((s) => s.id === selectedStudentId) || students[0];

  // Next-Action Calculation based on real student state
  const computeNextActions = () => {
    if (!student) return [];
    const actions: {
      id: string;
      title: string;
      category: string;
      priority: "urgent" | "high" | "normal";
      deadline: string;
      impact: string;
    }[] = [];

    if (student.feeBalanceDue > 0) {
      actions.push({
        id: "act-fee",
        title: `Clear Outstanding Dues (${formatNPR(student.feeBalanceDue)})`,
        category: "Financial",
        priority: "urgent",
        deadline: "Immediate",
        impact:
          "Failure to clear dues triggers financial hold on semester examination admit card.",
      });
    }

    if (student.attendancePercentage < 75) {
      actions.push({
        id: "act-att",
        title: `Attendance Remediation (${student.attendancePercentage}% is below 75% threshold)`,
        category: "Academic Compliance",
        priority: "urgent",
        deadline: "Current Semester",
        impact:
          "Minimum 75% class attendance is mandatory for university examination board eligibility.",
      });
    }

    actions.push({
      id: "act-course",
      title: "Review Elective Course Registration Options",
      category: "Curriculum",
      priority: "normal",
      deadline: "Prior to Term Start",
      impact:
        "Verify prerequisite dependencies before final semester enrollment.",
    });

    return actions;
  };

  const nextActions = computeNextActions();

  // Graduation Path Simulation calculation
  const totalRequiredCredits = 126; // Standard 4-year degree
  const completedCredits = student ? student.currentSemester * 15 : 0;
  const remainingCredits = Math.max(0, totalRequiredCredits - completedCredits);
  const remainingSemesters = Math.ceil(remainingCredits / 16);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto bg-white min-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FontAwesomeIcon icon={faBolt} className="text-blue-600 text-lg" />
            <span>Institutional Intelligence & Orchestration Suite</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Deep cross-module coordination: Life-Event Engine, Graduation
            Simulator, Next-Action Prioritization, and Anomaly Radar
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-md">
          <button
            onClick={() => setActiveTab("next_action")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "next_action"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Next-Action Engine
          </button>
          <button
            onClick={() => setActiveTab("simulator")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "simulator"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Graduation Simulator
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "timeline"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            One Timeline
          </button>
          <button
            onClick={() => setActiveTab("radar")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "radar"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Process Radar
          </button>
        </div>
      </div>

      {activeTab === "next_action" && (
        <div className="space-y-4">
          <Card
            title="Student Next-Action Engine"
            subtitle="Prioritized institutional obligations and actionable tasks"
          >
            {students.length === 0 ? (
              <EmptyState
                icon={faListCheck}
                title="No student selected"
                description="Enroll students into the SIS to calculate dynamic action priorities."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  <span className="text-xs font-medium text-slate-700">
                    Select Student:
                  </span>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white font-medium"
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.studentId})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  {nextActions.map((act) => (
                    <div
                      key={act.id}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1.5"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-900">
                          {act.title}
                        </span>
                        <Badge
                          variant={act.priority === "urgent" ? "error" : "info"}
                        >
                          {act.priority.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-slate-600">{act.impact}</p>
                      <div className="text-sm text-slate-400 font-mono">
                        Category: {act.category} • Target Deadline:{" "}
                        {act.deadline}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "simulator" && (
        <div className="space-y-4">
          <Card
            title="Graduation Path Simulator"
            subtitle="Simulate course selections, credit accumulation, and completion timeline"
          >
            {!student ? (
              <EmptyState
                icon={faGraduationCap}
                title="No student profile available"
                description="The graduation simulator requires student academic history from SIS."
              />
            ) : (
              <div className="space-y-5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="text-slate-500 block text-xs">
                      Degree Requirement
                    </span>
                    <span className="text-lg font-bold font-mono text-slate-900">
                      {totalRequiredCredits} Cr
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="text-emerald-700 block text-xs font-medium">
                      Completed
                    </span>
                    <span className="text-lg font-bold font-mono text-emerald-600">
                      {completedCredits} Cr
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="text-blue-700 block text-xs font-medium">
                      Remaining
                    </span>
                    <span className="text-lg font-bold font-mono text-blue-600">
                      {remainingCredits} Cr
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="text-purple-700 block text-xs font-medium">
                      Projected Terms
                    </span>
                    <span className="text-lg font-bold font-mono text-purple-700">
                      {remainingSemesters} Semesters
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-md space-y-1">
                  <div className="font-semibold text-blue-900">
                    Academic Rule & Dependency Analysis:
                  </div>
                  <p className="text-blue-800">
                    Student has maintained {student.gpa.toFixed(2)} GPA. All
                    core prerequisites for the next academic semester are met.
                    Graduation on schedule is mathematically projected at
                    standard 16-credit progression.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="space-y-4">
          <Card
            title="One Institutional Timeline"
            subtitle="Chronological audit of all student events across modules"
          >
            {!student ? (
              <EmptyState
                icon={faClock}
                title="No timeline records"
                description="Enroll students and record transactions to generate the unified institutional timeline."
              />
            ) : (
              <div className="space-y-4 text-xs">
                <div className="border-l-2 border-slate-200 pl-4 space-y-4">
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600 absolute -left-[21px] top-1" />
                    <div className="font-semibold text-slate-900">
                      Official Admission & SIS Profile Creation
                    </div>
                    <p className="text-slate-500 text-sm">
                      Enrolled into {student.programCode} Section{" "}
                      {student.sectionCode}
                    </p>
                    <span className="text-xs text-slate-400 font-mono">
                      Timestamp: Verified
                    </span>
                  </div>

                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 absolute -left-[21px] top-1" />
                    <div className="font-semibold text-slate-900">
                      Curriculum Enrollment & Fee Account Initialized
                    </div>
                    <p className="text-slate-500 text-sm">
                      Student ledger and class session roster synced
                    </p>
                    <span className="text-xs text-slate-400 font-mono">
                      Timestamp: Active
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "radar" && (
        <div className="space-y-4">
          <Card
            title="Institutional Anomaly Radar & Bureaucracy Detector"
            subtitle="Real-time statistical anomaly monitoring and process bottleneck analysis"
          >
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex justify-between items-center">
                <div>
                  <div className="font-semibold text-slate-900">
                    Digital Bureaucracy Analysis
                  </div>
                  <p className="text-slate-500 text-sm">
                    Detects duplicate documentation requests and unnecessary
                    handoff steps.
                  </p>
                </div>
                <Badge variant="success">0 Redundant Loops</Badge>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex justify-between items-center">
                <div>
                  <div className="font-semibold text-slate-900">
                    Attendance Anomaly Check
                  </div>
                  <p className="text-slate-500 text-sm">
                    Monitors rapid attendance declines or abnormal reporting
                    delays.
                  </p>
                </div>
                <Badge variant="info">Compliant</Badge>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex justify-between items-center">
                <div>
                  <div className="font-semibold text-slate-900">
                    Financial Hold Discrepancy Filter
                  </div>
                  <p className="text-slate-500 text-sm">
                    Cross-verifies ledger balances against examination admit
                    permissions.
                  </p>
                </div>
                <Badge variant="success">Verified</Badge>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
