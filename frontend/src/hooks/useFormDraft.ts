import { useCallback, useEffect, useRef, useState } from "react";
import { useCollegeOS } from "../context/CollegeOSContext";

interface UseFormDraftOptions<T extends Record<string, unknown>> {
  /** Unique key for this form (e.g., "student-request", "profile-edit") */
  formKey: string;
  /** Optional record ID to distinguish drafts for different records */
  recordId?: string | null;
  /** Initial form values */
  initialValues: T;
  /** Debounce delay in ms */
  debounceMs?: number;
  /** Fields to exclude from draft (e.g., passwords, tokens) */
  excludeFields?: (keyof T)[];
  /** Called when a draft is restored */
  onDraftRestored?: (draft: T) => void;
  /** Called when draft is cleared after successful submission */
  onDraftCleared?: () => void;
}

interface UseFormDraftReturn<T extends Record<string, unknown>> {
  /** Current form values (merged with draft if available) */
  values: T;
  /** Update a single field */
  setField: (field: keyof T, value: unknown) => void;
  /** Update multiple fields */
  setFields: (fields: Partial<T>) => void;
  /** Reset form to initial values and clear draft */
  reset: () => void;
  /** Manually save draft */
  saveDraft: () => void;
  /** Clear saved draft */
  clearDraft: () => void;
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Whether a draft was restored on mount */
  draftRestored: boolean;
  /** Restore the saved draft */
  restoreDraft: () => void;
  /** Discard the saved draft */
  discardDraft: () => void;
}

const DEBOUNCE_DEFAULT = 1000;
const STORAGE_PREFIX = "collegeos_draft_";

function getStorageKey(formKey: string, userId: string | null, recordId: string | null): string {
  const userPart = userId ? `_user_${userId}` : "_anonymous";
  const recordPart = recordId ? `_record_${recordId}` : "";
  return `${STORAGE_PREFIX}${formKey}${userPart}${recordPart}`;
}

function isSensitiveField(fieldName: string): boolean {
  const sensitivePatterns = [
    /password/i,
    /token/i,
    /secret/i,
    /credit/i,
    /card/i,
    /cvv/i,
    /ssn/i,
    /social/i,
    /auth/i,
    /api[_-]?key/i,
  ];
  return sensitivePatterns.some((pattern) => pattern.test(fieldName));
}

export function useFormDraft<T extends Record<string, unknown>>(
  options: UseFormDraftOptions<T>,
): UseFormDraftReturn<T> {
  const {
    formKey,
    recordId = null,
    initialValues,
    debounceMs = DEBOUNCE_DEFAULT,
    excludeFields = [],
    onDraftRestored,
    onDraftCleared,
  } = options;

  const { currentUser } = useCollegeOS();
  const userId = currentUser?.id || null;

  const storageKey = getStorageKey(formKey, userId, recordId);
  const excludeSet = new Set<string>(
    [...excludeFields, ...Object.keys(initialValues).filter(isSensitiveField)].map(String),
  );

  const [values, setValues] = useState<T>(initialValues);
  const [isDirty, setIsDirty] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialValuesRef = useRef(initialValues);
  initialValuesRef.current = initialValues;

  // Load draft on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const draft = JSON.parse(stored) as Partial<T>;
        // Merge draft with initial values (draft takes precedence)
        const merged = { ...initialValues, ...draft } as T;
        setValues(merged);
        setIsDirty(true);
        setDraftRestored(true);
        onDraftRestored?.(merged);
      }
    } catch {
      // Ignore parse errors, use initial values
    }
  }, [storageKey, initialValues, onDraftRestored]);

  // Save draft with debounce
  const saveDraft = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      // Filter out sensitive fields and excluded fields
      const draftData: Partial<T> = {};
      (Object.keys(values) as Array<keyof T>).forEach((key) => {
        if (!excludeSet.has(String(key))) {
          draftData[key] = values[key];
        }
      });

      localStorage.setItem(storageKey, JSON.stringify(draftData));
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }, [storageKey, values, excludeSet]);

  const debouncedSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(saveDraft, debounceMs);
  }, [saveDraft, debounceMs]);

  // Update single field
  const setField = useCallback(
    (field: keyof T, value: unknown) => {
      setValues((prev) => {
        const next = { ...prev, [field]: value };
        setIsDirty(true);
        debouncedSave();
        return next;
      });
    },
    [debouncedSave],
  );

  // Update multiple fields
  const setFields = useCallback(
    (fields: Partial<T>) => {
      setValues((prev) => {
        const next = { ...prev, ...fields };
        setIsDirty(true);
        debouncedSave();
        return next;
      });
    },
    [debouncedSave],
  );

  // Reset form to initial values
  const reset = useCallback(() => {
    setValues(initialValuesRef.current);
    setIsDirty(false);
    clearDraft();
  }, []);

  // Clear draft from storage
  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(storageKey);
      onDraftCleared?.();
    } catch {
      // Ignore
    }
  }, [storageKey, onDraftCleared]);

  // Restore draft manually
  const restoreDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const draft = JSON.parse(stored) as Partial<T>;
        const merged = { ...initialValuesRef.current, ...draft } as T;
        setValues(merged);
        setIsDirty(true);
        setDraftRestored(true);
        onDraftRestored?.(merged);
      }
    } catch {
      // Ignore
    }
  }, [storageKey, onDraftRestored]);

  // Discard draft (clear storage and reset form)
  const discardDraft = useCallback(() => {
    clearDraft();
    setValues(initialValuesRef.current);
    setIsDirty(false);
    setDraftRestored(false);
  }, [clearDraft]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Warn before unload if dirty
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return {
    values,
    setField,
    setFields,
    reset,
    saveDraft,
    clearDraft,
    isDirty,
    draftRestored,
    restoreDraft,
    discardDraft,
  };
}

export function clearAllDrafts(userId?: string | null): void {
  if (typeof window === "undefined") return;
  const prefix = userId ? `${STORAGE_PREFIX}_user_${userId}` : STORAGE_PREFIX;
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // Ignore
  }
}