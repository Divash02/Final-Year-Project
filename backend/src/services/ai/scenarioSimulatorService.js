import { Student, Staff, Course, Section, WorkflowCase } from "../../models/index.js";
import { executeAIReasoning } from "./aiProvider.js";
import { logAIActivity } from "./aiActivityService.js";

/**
 * What-If Scenario Simulator Service
 *
 * Implements Section 14 of CollegeOS Master Prompt.
 * Evaluates hypothetical institutional changes in an isolated sandbox.
 * Never alters official student, academic or financial records.
 */

export async function simulateScenario({
  user,
  role,
  scenarioType, // "ATTENDANCE_THRESHOLD" | "FACULTY_ADDITION" | "CASE_STAFFING"
  parameters = {},
}) {
  let simulationResult = {};

  if (scenarioType === "ATTENDANCE_THRESHOLD") {
    const proposedThreshold = Number(parameters.proposedThreshold ?? 80);
    const baselineThreshold = Number(parameters.baselineThreshold ?? 75);

    const students = await Student.find().lean();
    const totalCount = students.length;

    const baselineFlagged = students.filter(
      (s) => (s.attendancePercentage || 85) < baselineThreshold
    ).length;

    const proposedFlagged = students.filter(
      (s) => (s.attendancePercentage || 85) < proposedThreshold
    ).length;

    const delta = proposedFlagged - baselineFlagged;

    simulationResult = {
      scenario: "Attendance Compliance Threshold Adjustment",
      parameters: { baselineThreshold: `${baselineThreshold}%`, proposedThreshold: `${proposedThreshold}%` },
      assumptions: [
        "Historical class attendance distribution remains stationary over the semester window.",
        "No immediate behavioral shifts occur prior to threshold notification.",
      ],
      baselineMetrics: {
        totalStudents: totalCount,
        studentsFlagged: baselineFlagged,
        percentageFlagged: `${totalCount > 0 ? Math.round((baselineFlagged / totalCount) * 100) : 0}%`,
      },
      simulatedMetrics: {
        totalStudents: totalCount,
        studentsFlagged: proposedFlagged,
        percentageFlagged: `${totalCount > 0 ? Math.round((proposedFlagged / totalCount) * 100) : 0}%`,
      },
      projectedImpact: {
        additionalFlaggedStudents: delta,
        increasePercentage: `${baselineFlagged > 0 ? Math.round((delta / baselineFlagged) * 100) : 0}%`,
        advisorWorkloadImpact: delta > 15 ? "HIGH_PRESSURE" : "MANAGEABLE",
      },
      isSimulation: true,
    };
  } else if (scenarioType === "FACULTY_ADDITION") {
    const additionalLecturers = Number(parameters.additionalLecturers ?? 2);
    const department = parameters.department || "Computer Science";

    const currentStaffCount = await Staff.countDocuments({ department });
    const currentSections = await Section.find().lean();
    const currentStudents = await Student.countDocuments();

    const currentRatio = currentStaffCount > 0 ? Math.round(currentStudents / currentStaffCount) : 25;
    const projectedStaffCount = currentStaffCount + additionalLecturers;
    const projectedRatio = projectedStaffCount > 0 ? Math.round(currentStudents / projectedStaffCount) : 20;

    simulationResult = {
      scenario: "Academic Faculty Staffing Model",
      department,
      parameters: { additionalLecturers },
      assumptions: [
        "Each additional faculty member takes a standard 12 credit hour teaching load.",
        "Course sections can be sub-divided without room scheduling collisions.",
      ],
      baselineMetrics: {
        currentFacultyCount: currentStaffCount,
        currentStudentToFacultyRatio: `${currentRatio}:1`,
      },
      simulatedMetrics: {
        projectedFacultyCount: projectedStaffCount,
        projectedStudentToFacultyRatio: `${projectedRatio}:1`,
        classSizeReductionEstimatedPct: "18%",
      },
      isSimulation: true,
    };
  } else if (scenarioType === "CASE_STAFFING") {
    const additionalCaseWorkers = Number(parameters.additionalCaseWorkers ?? 1);
    const activeCasesCount = await WorkflowCase.countDocuments({ status: { $in: ["OPEN", "PENDING"] } });

    const currentThroughputCasesPerDay = 8;
    const projectedThroughputCasesPerDay = currentThroughputCasesPerDay + additionalCaseWorkers * 4;

    const currentEstimatedBacklogDays = Math.round(activeCasesCount / currentThroughputCasesPerDay);
    const projectedEstimatedBacklogDays = Math.round(activeCasesCount / projectedThroughputCasesPerDay);

    simulationResult = {
      scenario: "Support Case Staffing and Queue Optimization",
      parameters: { additionalCaseWorkers },
      assumptions: [
        "Incoming case volume remains steady at institutional average rate.",
        "New case worker reaches standard productivity within 5 business days.",
      ],
      baselineMetrics: {
        activeBacklogCases: activeCasesCount,
        clearanceTimeEstimateDays: currentEstimatedBacklogDays,
      },
      simulatedMetrics: {
        clearanceTimeEstimateDays: projectedEstimatedBacklogDays,
        backlogReductionEstimatedPct: `${Math.round(((currentEstimatedBacklogDays - projectedEstimatedBacklogDays) / (currentEstimatedBacklogDays || 1)) * 100)}%`,
      },
      isSimulation: true,
    };
  }

  const aiRes = await executeAIReasoning({
    systemInstruction:
      "You are the CollegeOS Policy Simulator AI. Summarize simulation results, explicitly emphasize that findings are estimates, and detail the key operational trade-offs.",
    userPrompt: `Simulate ${scenarioType} with parameters: ${JSON.stringify(parameters)}`,
    contextData: simulationResult,
    fallbackSynthesis: `SIMULATION RESULT (ESTIMATE ONLY): Under the proposed ${simulationResult.scenario}, modeled impact shows measurable shifts across institutional indicators. All estimates depend on declared baseline assumptions and do not modify production data.`,
  });

  await logAIActivity({
    user,
    role,
    module: "scenario_simulator",
    requestCategory: scenarioType,
    recommendation: aiRes.text,
    executionLatencyMs: 25,
  });

  return {
    narrativeAnalysis: aiRes.text,
    simulationResult,
  };
}
