import { useRef, useCallback } from "react";

export function useFormValidation() {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldsRef = useRef<
    Map<string, { element: HTMLElement; error: string }>
  >(new Map());

  const registerField = useCallback(
    (name: string, element: HTMLElement) => {
      fieldsRef.current.set(name, { element, error: "" });
    },
    []
  );

  const setFieldError = useCallback(
    (name: string, error: string) => {
      const field = fieldsRef.current.get(name);
      if (field) {
        field.error = error;
      }
    },
    []
  );

  const clearFieldError = useCallback((name: string) => {
    const field = fieldsRef.current.get(name);
    if (field) {
      field.error = "";
    }
  }, []);

  const validateAndFocus = useCallback(() => {
    if (!formRef.current) return false;

    const formData = new FormData(formRef.current);
    let firstInvalidField: HTMLElement | null = null;
    let isValid = true;

    for (const [name, { element, error }] of fieldsRef.current.entries()) {
      const value = formData.get(name);
      const hasValue = value !== null && value !== "";
      const required = element.hasAttribute("required");

      if (required && !hasValue) {
        isValid = false;
        if (!firstInvalidField) firstInvalidField = element;
      }

      if (error) {
        isValid = false;
        if (!firstInvalidField) firstInvalidField = element;
      }
    }

    if (!isValid && firstInvalidField) {
      firstInvalidField.focus();
      firstInvalidField.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    return isValid;
  }, []);

  const getFormRef = useCallback(() => formRef, []);

  return {
    formRef,
    registerField,
    setFieldError,
    clearFieldError,
    validateAndFocus,
    getFormRef,
  };
}

export function useFormValidationFocus() {
  const formRef = useRef<HTMLFormElement>(null);

  const focusFirstInvalid = useCallback(() => {
    if (!formRef.current) return;

    const inputs = formRef.current.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );

    for (const input of inputs) {
      if (!input.validity.valid) {
        input.focus();
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      }
    }
  }, []);

  return { formRef, focusFirstInvalid };
}