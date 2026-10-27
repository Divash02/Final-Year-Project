import React, { useState, useEffect, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartPie,
  faWandMagicSparkles,
  faArrowTrendUp,
  faAward,
  faRotateRight,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { fetchQuizInsights, fetchAttemptRoster } from "../../../services/lmsApi";
import type { LmsAttemptRoster, LmsQuestionInsight } from "../../../types/lms";

interface QuizAnalyticsTabProps {
  quizId: string;
  quizTitle: string;
  maxMarks: number;
}

export const QuizAnalyticsTab: React.FC<QuizAnalyticsTabProps> = ({
  quizId,
  quizTitle,
  maxMarks,
}) => {
  const [insights, setInsights] = useState<LmsQuestionInsight[]>([]);
  const [roster, setRoster] = useState<LmsAttemptRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [insightRes, rosterRes] = await Promise.allSettled([
        fetchQuizInsights(quizId),
        fetchAttemptRoster(quizId),
      ]);
      if (insightRes.status === "fulfilled") {
        setInsights(insightRes.value.questions || (insightRes.value as any).insights || []);
      }
      if (rosterRes.status === "fulfilled") {
        setRoster(rosterRes.value);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const attempts = roster?.attempts || [];
  const gradedAttempts = attempts.filter((a) => a.score != null);

  const metrics = useMemo(() => {
    if (!gradedAttempts.length) {
      return {
        avgScore: 0,
        avgPercentage: 0,
        highScore: 0,
        lowScore: 0,
        passRate: 0,
        totalGraded: 0,
      };
    }

    const scores = gradedAttempts.map((a) => a.score as number);
    const sum = scores.reduce((acc, curr) => acc + curr, 0);
    const avg = sum / scores.length;
    const high = Math.max(...scores);
    const low = Math.min(...scores);
    const passed = gradedAttempts.filter((a) => (a.percentage || 0) >= 40).length;
    const passPct = (passed / gradedAttempts.length) * 100;

    return {
      avgScore: avg,
      avgPercentage: (avg / (maxMarks || 1)) * 100,
      highScore: high,
      lowScore: low,
      passRate: passPct,
      totalGraded: gradedAttempts.length,
    };
  }, [gradedAttempts, maxMarks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Psychometric & Assessment Analytics
          </h3>
          <p className="text-xs text-slate-500">
            Cohort score distribution, item difficulty discrimination, and pedagogical insights.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={faRotateRight}
          onClick={() => void loadData()}
          isLoading={loading}
        >
          Refresh Data
        </Button>
      </div>

      {/* Aggregate Score Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Average Score
          </span>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {metrics.avgScore.toFixed(1)} <span className="text-xs font-normal text-slate-400">/ {maxMarks}</span>
          </div>
          <span className="text-xs text-teal-600 font-medium">
            {metrics.avgPercentage.toFixed(1)}% cohort mean
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Pass Rate (≥40%)
          </span>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {metrics.passRate.toFixed(0)}%
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {metrics.totalGraded} graded submissions
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Highest Score
          </span>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {metrics.highScore} <span className="text-xs font-normal text-slate-400">/ {maxMarks}</span>
          </div>
          <span className="text-xs text-slate-500 font-medium">Top performing mark</span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Lowest Score
          </span>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {metrics.lowScore} <span className="text-xs font-normal text-slate-400">/ {maxMarks}</span>
          </div>
          <span className="text-xs text-slate-500 font-medium">Lowest recorded mark</span>
        </div>
      </div>

      {/* AI Pedagogical Insight Banner */}
      <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-4 dark:border-teal-800 dark:bg-teal-950/30 flex items-start gap-3">
        <span className="p-2 rounded-md bg-teal-600 text-white shrink-0 mt-0.5">
          <FontAwesomeIcon icon={faWandMagicSparkles} className="h-4 w-4" />
        </span>
        <div className="space-y-1 text-xs">
          <h4 className="font-bold text-teal-950 dark:text-teal-200 text-sm">
            AI Assessment Insights
          </h4>
          <p className="text-teal-900/90 dark:text-teal-200/90 leading-relaxed">
            {metrics.totalGraded === 0
              ? "No student submission data is available yet for deep psychometric analysis. As students complete attempts, question discrimination indices and distractor analysis will appear here."
              : metrics.passRate < 50
                ? "Over half of the candidates scored below passing threshold. Consider reviewing whether high-weight questions had ambiguous wording or whether foundational material requires revision."
                : "The cohort demonstrated solid understanding across foundational topics. Discrimination between top and average candidates remains healthy."}
          </p>
          <span className="text-[11px] text-teal-800/80 dark:text-teal-300/80 italic block pt-1">
            Note: AI provides diagnostic observations for instructor interpretation. Low scores may indicate either rigorous evaluation or conceptual ambiguity.
          </span>
        </div>
      </div>

      {/* Question Level Breakdown */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          Question-Level Performance Breakdown
        </h4>

        {insights.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
            No item discrimination data available for this paper.
          </div>
        ) : (
          <div className="space-y-2.5">
            {insights.map((item, index) => {
              const attemptCount = item.attemptCount ?? item.attempts ?? 0;
              const correctCount = item.correctCount ?? item.correct ?? 0;
              const correctPct = attemptCount > 0 ? (correctCount / attemptCount) * 100 : 0;
              const isChallenging = correctPct < 40 && attemptCount > 0;
              const questionKey = item.questionId || item.id || `q-${index}`;

              return (
                <div
                  key={questionKey}
                  className="rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Question {index + 1}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500 font-mono">
                        {item.type.replace(/_/g, " ").toLowerCase()}
                      </span>
                      {isChallenging && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 font-semibold text-[10px]">
                          High Difficulty
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 truncate max-w-lg">
                      {item.text}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full sm:w-48 space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      <span>Correct: {correctPct.toFixed(0)}%</span>
                      <span>{attemptCount} responses</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          correctPct >= 70
                            ? "bg-teal-500"
                            : correctPct >= 40
                              ? "bg-amber-500"
                              : "bg-rose-500"
                        }`}
                        style={{ width: `${correctPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizAnalyticsTab;
