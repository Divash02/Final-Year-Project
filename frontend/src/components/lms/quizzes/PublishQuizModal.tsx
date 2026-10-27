import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRocket,
  faCalendarAlt,
  faClock,
  faAward,
  faLayerGroup,
  faRotateLeft,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";

interface PublishQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmPublish: () => void;
  publishing: boolean;
  quizTitle: string;
  courseName?: string;
  questionCount: number;
  totalMarks: number;
  maxMarks: number;
  durationMinutes: number;
  openAt?: string;
  closeAt?: string;
  attemptsAllowed: number;
}

export const PublishQuizModal: React.FC<PublishQuizModalProps> = ({
  isOpen,
  onClose,
  onConfirmPublish,
  publishing,
  quizTitle,
  courseName,
  questionCount,
  totalMarks,
  maxMarks,
  durationMinutes,
  openAt,
  closeAt,
  attemptsAllowed,
}) => {
  const marksMatch = totalMarks === maxMarks;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Publish Assessment"
      maxWidth="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Review the final assessment settings. Once published, students in the assigned cohort will be able to access and attempt this quiz according to availability.
        </p>

        {/* Assessment Card Summary */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70 space-y-3">
          <div className="border-b border-slate-200 dark:border-slate-700 pb-2">
            <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
              {courseName || "Course Assessment"}
            </span>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {quizTitle}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <FontAwesomeIcon icon={faLayerGroup} className="text-slate-400 w-4" />
              <span><strong>{questionCount}</strong> Questions</span>
            </div>

            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <FontAwesomeIcon icon={faAward} className="text-slate-400 w-4" />
              <span><strong>{totalMarks}</strong> Total Marks</span>
            </div>

            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <FontAwesomeIcon icon={faClock} className="text-slate-400 w-4" />
              <span><strong>{durationMinutes}</strong> Minutes Limit</span>
            </div>

            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <FontAwesomeIcon icon={faRotateLeft} className="text-slate-400 w-4" />
              <span><strong>{attemptsAllowed}</strong> {attemptsAllowed === 1 ? "Attempt" : "Attempts"} Allowed</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs space-y-1 text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faCalendarAlt} className="w-3.5 text-slate-400" />
              <span><strong>Opens:</strong> {openAt ? new Date(openAt).toLocaleString() : "Immediately upon publish"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faCalendarAlt} className="w-3.5 text-slate-400" />
              <span><strong>Closes:</strong> {closeAt ? new Date(closeAt).toLocaleString() : "No end deadline set"}</span>
            </div>
          </div>
        </div>

        {!marksMatch && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
            <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5 text-amber-600 shrink-0" />
            <div>
              <strong>Marks Notice: </strong> Question marks total ({totalMarks}) differs from quiz max marks ({maxMarks}). Consider reviewing before publishing.
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={publishing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={faRocket}
            onClick={onConfirmPublish}
            isLoading={publishing}
            loadingLabel="Publishing..."
          >
            Publish Quiz
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PublishQuizModal;

