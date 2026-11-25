import React, { useState, useEffect } from "react";
import * as internshipApi from "../../../../services/internshipApi";
import { LogbookEntry, EvaluationRubric, MeetingItem } from "../types";
import {
  StatusBadge,
  MetricCard,
  ModalWrapper,
  DrawerWrapper,
} from "../components/SharedWidgets";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChalkboardUser,
  faUsers,
  faBookOpen,
  faClock,
  faStar,
  faCalendarCheck,
  faComments,
  faTriangleExclamation,
  faCheck,
  faTimes,
  faPlus,
  faDownload,
  faBuilding,
  faGraduationCap,
} from "@fortawesome/free-solid-svg-icons";

interface FacultyPortalProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
  searchQuery: string;
}

export const FacultyPortal: React.FC<FacultyPortalProps> = ({
  activePage,
  onNavigate,
  searchQuery,
}) => {
  const [logbooks, setLogbooks] = useState<LogbookEntry[]>([]);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const logbooksRes = await internshipApi.listPlacements({ page: 1, limit: 50 });
        if (cancelled) return;
        // Fetch logbooks for each placement (best-effort)
        const placementList = Array.isArray(logbooksRes?.items) ? logbooksRes.items : [];
        const allLogbooks: LogbookEntry[] = [];
        for (const p of placementList) {
          try {
            const lb = await internshipApi.listLogbooks(p.id || p._id);
            const items = Array.isArray(lb?.items) ? lb.items : Array.isArray(lb) ? lb : [];
            allLogbooks.push(...items);
          } catch {
            // ignore per-placement errors
          }
        }
        if (!cancelled) setLogbooks(allLogbooks);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load faculty data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Faculty grading form state
  const [evalAcademic, setEvalAcademic] = useState(5);
  const [evalDocumentation, setEvalDocumentation] = useState(5);
  const [evalAlignment, setEvalAlignment] = useState(5);
  const [evalFeedback, setEvalFeedback] = useState("");
  const [evalSubmitted, setEvalSubmitted] = useState(false);

  // Issues & Escalation State
  const [issues, setIssues] = useState([
    {
      id: "iss-1",
      studentName: "Puja Karki",
      companyName: "FinPulse Payments Ltd.",
      severity: "MEDIUM",
      title: "Requested adjustment in remote work schedule due to exam prep",
      status: "RESOLVED",
      resolution: "Supervisor approved 3 days remote schedule during exam revision week.",
    },
  ]);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [newIssueDesc, setNewIssueDesc] = useState("");

  // Sign off faculty review
  const handleFacultyLogbookReview = (logId: string) => {
    const updated = logbooks.map((l) =>
      l.id === logId
        ? {
            ...l,
            facultyFeedback: "Academic criteria satisfied. Thorough technical analysis documented.",
          }
        : l
    );
    setLogbooks(updated);
  };

  // --------------------------------------------------------------------------
  // PAGE 1: SUPERVISOR DASHBOARD
  // --------------------------------------------------------------------------
  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-blue-900 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
            Faculty Academic Supervision
          </span>
          <h2 className="text-xl font-bold mt-2">
            Prof. Dr. Suresh Dhakal — Department of CS & Software Engineering
          </h2>
          <p className="text-xs text-blue-200 mt-1">
            Supervisory Cohort: 6 Enrolled Interns • 4 Partner Organizations
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigate("fac_assigned")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs"
          >
            My Assigned Interns
          </button>
          <button
            onClick={() => onNavigate("fac_logbooks")}
            className="px-3.5 py-2 border border-blue-400/30 text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
          >
            Review Logbooks ({logbooks.length})
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Assigned Interns"
          value="6 Students"
          subtitle="All Placements Active"
          icon={faUsers}
          color="blue"
        />
        <MetricCard
          title="Pending Logbook Reviews"
          value={logbooks.filter((l) => !l.facultyFeedback).length}
          subtitle="Weekly Audit Required"
          icon={faClock}
          color="amber"
        />
        <MetricCard
          title="Scheduled Tripartite Syncs"
          value={meetings.length}
          subtitle="Upcoming Site Check-in"
          icon={faCalendarCheck}
          color="indigo"
        />
        <MetricCard
          title="Average Midterm Grade"
          value="Grade 'A'"
          subtitle="92% Performance Average"
          icon={faStar}
          color="emerald"
        />
      </div>

      {/* Assigned Cohort Table Snapshot */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <FontAwesomeIcon icon={faUsers} className="text-blue-600" />
            <span>Assigned Student Placements</span>
          </h3>
          <button
            onClick={() => onNavigate("fac_assigned")}
            className="text-xs text-blue-600 hover:underline font-semibold"
          >
            View Detailed Cohort
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <tr>
                <th className="py-2.5 px-3">Student Name</th>
                <th className="py-2.5 px-3">Host Organization</th>
                <th className="py-2.5 px-3">Industry Supervisor</th>
                <th className="py-2.5 px-3">Hours Progress</th>
                <th className="py-2.5 px-3 text-right">Academic Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                  {MOCK_ACTIVE_PLACEMENT.studentName}
                  <span className="block text-[11px] text-slate-400">{MOCK_ACTIVE_PLACEMENT.studentId}</span>
                </td>
                <td className="py-3 px-3 font-medium">{MOCK_ACTIVE_PLACEMENT.companyName}</td>
                <td className="py-3 px-3">
                  {MOCK_ACTIVE_PLACEMENT.industrySupervisor.name}
                  <span className="block text-[11px] text-slate-400">{MOCK_ACTIVE_PLACEMENT.industrySupervisor.email}</span>
                </td>
                <td className="py-3 px-3">
                  <span className="font-semibold">{MOCK_ACTIVE_PLACEMENT.completedHours} / {MOCK_ACTIVE_PLACEMENT.totalRequiredHours} hrs</span>
                  <div className="w-24 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-1">
                    <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${MOCK_ACTIVE_PLACEMENT.progressPercentage}%` }} />
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <button
                    onClick={() => onNavigate("fac_evaluations")}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    Grade Rubric
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 2: LOGBOOK & REPORT REVIEWS
  // --------------------------------------------------------------------------
  const renderLogbookReviews = () => (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Academic Logbook & Report Review Queue
          </h2>
          <p className="text-xs text-slate-500">
            Verify learning objectives alignment with university curriculum guidelines
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {logbooks.map((log) => (
          <div
            key={log.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  {log.studentName} — Week {log.weekNumber} ({log.dateRange})
                </h4>
                <p className="text-[11px] text-slate-400">Total Hours: {log.hoursWorked} hrs</p>
              </div>
              <StatusBadge status={log.status} />
            </div>

            <div className="mt-3 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
              <p><strong>Technical Contributions:</strong> {log.tasksCompleted}</p>
              <p><strong>Learnings & Challenges:</strong> {log.keyLearnings}</p>
              {log.supervisorFeedback && (
                <p className="italic text-emerald-600">
                  <strong>Industry Supervisor:</strong> "{log.supervisorFeedback}"
                </p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              {log.facultyFeedback ? (
                <span className="text-xs font-semibold text-blue-600">
                  ✓ Academic Endorsement: "{log.facultyFeedback}"
                </span>
              ) : (
                <div className="flex items-center justify-end w-full space-x-2">
                  <button
                    onClick={() => handleFacultyLogbookReview(log.id)}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center space-x-1"
                  >
                    <FontAwesomeIcon icon={faCheck} />
                    <span>Endorse Academic Log</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 3: FACULTY EVALUATIONS & RUBRICS
  // --------------------------------------------------------------------------
  const renderEvaluations = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
          University Faculty Supervisor Grading Rubric
        </h3>
        <p className="text-xs text-slate-500 mb-5">
          Submit official university marks for Aarav Sharma (Apex Global Cloud Solutions)
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setEvalSubmitted(true);
            setTimeout(() => setEvalSubmitted(false), 2000);
          }}
          className="space-y-4 text-xs"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="font-semibold block mb-1">Academic & Technical Rigor (1-5)</label>
              <select
                value={evalAcademic}
                onChange={(e) => setEvalAcademic(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value={5}>5 - Excellent Application of CS Principles</option>
                <option value={4}>4 - Above Average</option>
                <option value={3}>3 - Satisfactory</option>
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Weekly Logbook & Report Quality (1-5)</label>
              <select
                value={evalDocumentation}
                onChange={(e) => setEvalDocumentation(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value={5}>5 - Exemplary Technical Documentation</option>
                <option value={4}>4 - Solid</option>
                <option value={3}>3 - Needs Minor Improvement</option>
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Curricular Learning Plan Alignment (1-5)</label>
              <select
                value={evalAlignment}
                onChange={(e) => setEvalAlignment(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value={5}>5 - Fully Aligned with Degree Standards</option>
                <option value={4}>4 - Mostly Aligned</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1">Faculty Academic Remarks & Recommendations *</label>
            <textarea
              rows={3}
              required
              placeholder="Provide academic critique, evaluation of theoretical application, and commendations..."
              value={evalFeedback}
              onChange={(e) => setEvalFeedback(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>

          {evalSubmitted && (
            <div className="p-3 bg-blue-100 text-blue-900 rounded-lg font-semibold text-center">
              ✓ Faculty marks recorded! Converted to institutional Grade: 'A' (6 Academic Credits).
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs"
            >
              Submit University Grade to Exam Office
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 4: ISSUES & ESCALATIONS
  // --------------------------------------------------------------------------
  const renderIssues = () => (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Student Workplace Issues & Escalations
          </h2>
          <p className="text-xs text-slate-500">
            Log and mediate workplace concerns, overtime violations, or scope discrepancies
          </p>
        </div>
        <button
          onClick={() => setShowIssueModal(true)}
          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center space-x-1"
        >
          <FontAwesomeIcon icon={faPlus} />
          <span>Report Workplace Issue</span>
        </button>
      </div>

      <div className="space-y-3">
        {issues.map((iss) => (
          <div
            key={iss.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">{iss.title}</h4>
                <p className="text-[11px] text-slate-400">{iss.studentName} • {iss.companyName}</p>
              </div>
              <StatusBadge status={iss.status} />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
              <strong>Resolution:</strong> {iss.resolution}
            </p>
          </div>
        ))}
      </div>

      {/* Modal: Report Issue */}
      <ModalWrapper
        isOpen={showIssueModal}
        onClose={() => setShowIssueModal(false)}
        title="Escalate Workplace Concern"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setIssues([
              ...issues,
              {
                id: `iss-${Date.now()}`,
                studentName: "Aarav Sharma",
                companyName: "Apex Global",
                severity: "HIGH",
                title: newIssueTitle,
                status: "INVESTIGATING",
                resolution: "Logged for coordinator mediation.",
              },
            ]);
            setShowIssueModal(false);
            setNewIssueTitle("");
          }}
          className="space-y-4 text-xs"
        >
          <div>
            <label className="font-semibold block mb-1">Concern Summary *</label>
            <input
              type="text"
              required
              placeholder="e.g. Discrepancy in assigned technical tasks"
              value={newIssueTitle}
              onChange={(e) => setNewIssueTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Details & Mediation Request *</label>
            <textarea
              rows={3}
              required
              placeholder="Detail the circumstances, dates, and communications..."
              value={newIssueDesc}
              onChange={(e) => setNewIssueDesc(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowIssueModal(false)}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-xs"
            >
              Log Escalation
            </button>
          </div>
        </form>
      </ModalWrapper>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      {activePage === "fac_dashboard" && renderDashboard()}
      {(activePage === "fac_assigned" || activePage === "fac_plans" || activePage === "fac_progress") &&
        renderDashboard()}
      {(activePage === "fac_logbooks" || activePage === "fac_reports") && renderLogbookReviews()}
      {(activePage === "fac_evaluations" || activePage === "fac_feedback") && renderEvaluations()}
      {activePage === "fac_issues" && renderIssues()}
      {activePage === "fac_meetings" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">
            Tripartite Supervisory Check-ins
          </h3>
          <div className="space-y-3">
            {meetings.map((mtg) => (
              <div
                key={mtg.id}
                className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 text-xs flex items-center justify-between"
              >
                <div>
                  <h5 className="font-bold text-slate-900 dark:text-white">{mtg.title}</h5>
                  <p className="text-slate-400 mt-0.5">{mtg.scheduledTime}</p>
                  <p className="text-slate-500 mt-1">Attendees: {mtg.attendees.join(", ")}</p>
                </div>
                <a
                  href={mtg.meetingLink || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-xs"
                >
                  Join Meeting
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
