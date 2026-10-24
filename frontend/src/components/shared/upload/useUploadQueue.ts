import { useCallback, useEffect, useRef, useState } from "react";
import {
  uploadWithProgress,
  UploadResult,
} from "../../../services/uploadClient";

export type UploadItemStatus =
  | "queued"
  | "uploading"
  | "done"
  | "error"
  | "cancelled";

export interface UploadItem {
  /** Queue-local id. */
  id: string;
  file: File;
  status: UploadItemStatus;
  /** 0–100, or null while the total size is unknown. */
  percent: number | null;
  /** Server verdict for the last attempt, when it completed. */
  result?: UploadResult;
  error?: string;
  /** Attempts so far, for the retry affordance. */
  attempts: number;
}

export interface UploadQueueOptions {
  /**
   * Performs one transfer. Receives the file, the metadata that applies
   * to it, and a progress callback, and returns an abortable task.
   * Real callers pass `uploadWithProgress` bound to their route.
   */
  upload: (
    file: File,
    meta: Record<string, string>,
    onProgress: (percent: number | null) => void,
  ) => { promise: Promise<UploadResult>; abort: () => void };
  /** Metadata applied to every file staged while it is set. */
  fields?: Record<string, string>;
  /** Start transfers automatically (default) or wait for `startAll`. */
  autoStart?: boolean;
  /** At most this many transfers at once. */
  concurrency?: number;
  onDone?: (item: UploadItem, result: UploadResult) => void;
  onError?: (item: UploadItem, error: Error) => void;
}

export interface UploadQueueApi {
  items: UploadItem[];
  queuedCount: number;
  uploadingCount: number;
  doneCount: number;
  errorCount: number;
  /** Stage files for upload. */
  add: (
    files: File[],
    /**
     * Metadata applied to every staged file. A function
     * receives each file, so per-file fields (a title
     * derived from the filename) are possible.
     */
    meta?:
      | Record<string, string>
      | ((file: File) => Record<string, string>),
  ) => void;
  /** Start a single queued item now. */
  start: (id: string) => void;
  /** Abort an in-flight transfer. */
  cancel: (id: string) => void;
  /** Re-queue a failed or cancelled item. */
  retry: (id: string) => void;
  /** Remove an item from the queue (aborts it if in flight). */
  remove: (id: string) => void;
  /** Start every queued item. */
  startAll: () => void;
  /** Abort every in-flight transfer. */
  cancelAll: () => void;
  /** Drop finished and failed items, keeping in-flight ones. */
  clearFinished: () => void;
  /** Metadata for files staged after this call. */
  setFields: (fields: Record<string, string>) => void;
  /** True while any transfer is in flight. */
  busy: boolean;
}

let nextId = 0;

/**
 * The upload state machine.
 *
 * One hook owns the whole queue: staging, progress, concurrency,
 * cancellation, retry and removal. It deliberately holds no server
 * state — a finished item carries the server's response so the caller
 * decides what it means (a material row, a submission, a version).
 *
 * Scheduling decisions read a ref mirror of the queue, because React
 * state is not safe to branch on inside a state updater.
 */
export function useUploadQueue(
  options: UploadQueueOptions,
): UploadQueueApi {
  const {
    upload,
    fields: initialFields,
    autoStart = true,
    concurrency = 2,
    onDone,
    onError,
  } = options;

  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const fieldsRef = useRef<Record<string, string>>(initialFields ?? {});
  const itemMeta = useRef<Map<string, Record<string, string>>>(new Map());
  const tasksRef = useRef<Map<string, { abort: () => void }>>(new Map());
  const optionsRef = useRef({ upload, onDone, onError });
  optionsRef.current = { upload, onDone, onError };

  const mirror = useCallback((updater: (prev: UploadItem[]) => UploadItem[]) => {
    setItems((prev) => {
      const next = updater(prev);
      itemsRef.current = next;
      return next;
    });
  }, []);

  const patch = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      mirror((current) =>
        current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [mirror],
  );

  const run = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((row) => row.id === id);
      if (!item || item.status !== "queued") return;

      const meta = { ...fieldsRef.current, ...itemMeta.current.get(id) };
      const task = optionsRef.current.upload(
        item.file,
        meta,
        (percent) => patch(id, { percent }),
      );
      tasksRef.current.set(id, task);
      patch(id, { status: "uploading", error: undefined });

      task.promise
        .then((result) => {
          tasksRef.current.delete(id);
          patch(id, { status: "done", percent: 100, result });
          const finished = itemsRef.current.find((row) => row.id === id);
          if (finished) {
            optionsRef.current.onDone?.(
              { ...finished, status: "done", percent: 100, result },
              result,
            );
          }
          scheduleRef.current();
        })
        .catch((error: Error) => {
          tasksRef.current.delete(id);
          const cancelled = error.message === "Upload cancelled.";
          patch(id, {
            status: cancelled ? "cancelled" : "error",
            error: error.message,
          });
          if (!cancelled) {
            const failed = itemsRef.current.find((row) => row.id === id);
            if (failed) {
              optionsRef.current.onError?.(
                { ...failed, status: "error", error: error.message },
                error,
              );
            }
          }
          scheduleRef.current();
        });
    },
    [patch],
  );

  /** Fills free concurrency slots from the queued items. */
  const schedule = useCallback(() => {
    const inFlight = itemsRef.current.filter(
      (row) => row.status === "uploading",
    ).length;
    let slots = Math.max(0, concurrency - inFlight);
    for (const item of itemsRef.current) {
      if (slots <= 0) break;
      if (item.status === "queued") {
        slots -= 1;
        run(item.id);
      }
    }
  }, [concurrency, run]);
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  const add = useCallback(
    (
      files: File[],
      meta?: Record<string, string> | ((file: File) => Record<string, string>),
    ) => {
      const staged: UploadItem[] = files.map((file) => {
        const id = `upload-${Date.now()}-${(nextId += 1)}`;
        const resolved =
          typeof meta === "function" ? meta(file) : meta;
        if (resolved) itemMeta.current.set(id, resolved);
        return {
          id,
          file,
          status: "queued" as const,
          percent: null,
          attempts: 0,
        };
      });
      mirror((current) => {
        const next = [...current, ...staged];
        itemsRef.current = next;
        return next;
      });
      if (autoStart) scheduleRef.current();
    },
    [autoStart, mirror],
  );

  const start = useCallback(
    (id: string) => {
      run(id);
    },
    [run],
  );

  const startAll = useCallback(() => {
    scheduleRef.current();
  }, []);

  const cancel = useCallback((id: string) => {
    tasksRef.current.get(id)?.abort();
  }, []);

  const retry = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((row) => row.id === id);
      if (!item) return;
      if (item.status !== "error" && item.status !== "cancelled") return;
      const requeued: UploadItem = {
        ...item,
        status: "queued",
        error: undefined,
        attempts: item.attempts + 1,
      };
      mirror((current) =>
        current.map((row) => (row.id === id ? requeued : row)),
      );
      scheduleRef.current();
    },
    [mirror],
  );

  const remove = useCallback((id: string) => {
    tasksRef.current.get(id)?.abort();
    tasksRef.current.delete(id);
    itemMeta.current.delete(id);
    mirror((current) => current.filter((row) => row.id !== id));
  }, [mirror]);

  const cancelAll = useCallback(() => {
    for (const task of tasksRef.current.values()) task.abort();
  }, []);

  const clearFinished = useCallback(() => {
    mirror((current) =>
      current.filter(
        (row) => row.status === "uploading" || row.status === "queued",
      ),
    );
  }, [mirror]);

  const setFields = useCallback((fields: Record<string, string>) => {
    fieldsRef.current = fields;
  }, []);

  // Abort anything still in flight when the owning view unmounts, so a
  // navigation never leaves a half-written upload pretending to continue.
  useEffect(() => {
    return () => {
      for (const task of tasksRef.current.values()) task.abort();
    };
  }, []);

  const queuedCount = items.filter((row) => row.status === "queued").length;
  const uploadingCount = items.filter((row) => row.status === "uploading").length;
  const doneCount = items.filter((row) => row.status === "done").length;
  const errorCount = items.filter(
    (row) => row.status === "error" || row.status === "cancelled",
  ).length;

  return {
    items,
    queuedCount,
    uploadingCount,
    doneCount,
    errorCount,
    add,
    start,
    cancel,
    retry,
    remove,
    startAll,
    cancelAll,
    clearFinished,
    setFields,
    busy: uploadingCount > 0,
  };
}

export { uploadWithProgress };
