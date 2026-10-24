import { fetchExecution, submitExecution } from "./codingApi";
import type { ExecutionResult } from "./codingTypes";

/** How often the editor polls a pending execution. */
export const executePollIntervalMs = 1200;

const TERMINAL_STATUSES = new Set([
  "ACCEPTED",
  "FAILED",
  "TIMEOUT",
  "PROVIDER_ERROR",
]);

export interface RunCodePayload {
  languageId: string;
  sourceCode: string;
  stdin?: string;
  projectId?: string;
}

/** Submits source code for isolated execution. */
export async function runCode(
  payload: RunCodePayload,
): Promise<{ executionId: string }> {
  const result = await submitExecution(payload);
  return { executionId: result.executionId };
}

/**
 * Polls an execution until it reaches a terminal state.
 * `onTick` receives intermediate results so the console
 * can show live provider status while the job is queued.
 */
export async function pollExecution(
  executionId: string,
  options: {
    signal?: AbortSignal;
    onTick?: (result: ExecutionResult) => void;
  } = {},
): Promise<ExecutionResult> {
  const { signal, onTick } = options;

  for (;;) {
    if (signal?.aborted) {
      const error = new Error("Execution cancelled.");
      error.name = "AbortError";
      throw error;
    }
    const { execution } = await fetchExecution(executionId);
    if (TERMINAL_STATUSES.has(execution.status)) {
      return execution;
    }
    onTick?.(execution);
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, executePollIntervalMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve(undefined);
        },
        { once: true },
      );
    });
  }
}
