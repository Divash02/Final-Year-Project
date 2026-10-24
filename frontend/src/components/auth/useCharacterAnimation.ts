import { useState, useEffect, useCallback, useRef } from "react";
import { CharacterState } from "./BlobCharacter";

interface UseCharacterAnimationReturn {
  state: CharacterState;
  pointerPosition: { x: number; y: number } | null;
  reducedMotion: boolean;
  setFieldFocus: (field: "email" | "password" | null) => void;
  setPasswordVisible: (visible: boolean) => void;
  setSubmitting: (submitting: boolean) => void;
  setAuthResult: (result: "success" | "error" | null) => void;
  handlePointerMove: (event: React.MouseEvent<HTMLElement>) => void;
  handlePointerLeave: () => void;
  sceneRef: React.RefObject<HTMLDivElement | null>;
}

export const useCharacterAnimation = (): UseCharacterAnimationReturn => {
  const [state, setState] = useState<CharacterState>("idle");
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [passwordVisible, setPasswordVisibleState] = useState(false);
  const [isSubmitting, setIsSubmittingState] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const previousStateRef = useRef<CharacterState>("idle");
  const authResultTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (isSubmitting) {
      previousStateRef.current = state;
      setState("submitting");
    } else if (previousStateRef.current === "submitting") {
      setState(previousStateRef.current);
    }
  }, [isSubmitting, state]);

  const setFieldFocus = useCallback((field: "email" | "password" | null) => {
    if (isSubmitting) return;

    if (field === "email") {
      setState("emailFocused");
    } else if (field === "password") {
      setState("passwordFocused");
    } else {
      setState(pointerPosition ? "pointerTracking" : "idle");
    }
  }, [isSubmitting, pointerPosition]);

  const handlePasswordVisibleChange = useCallback((visible: boolean) => {
    setPasswordVisibleState(visible);
    if (visible && !isSubmitting) {
      setState("passwordVisible");
      setTimeout(() => {
        if (!isSubmitting && passwordVisible) {
          setState("passwordFocused");
        }
      }, 800);
    } else if (!isSubmitting) {
      setState("passwordFocused");
    }
  }, [isSubmitting, passwordVisible]);

  const handleSubmittingChange = useCallback((submitting: boolean) => {
    setIsSubmittingState(submitting);
  }, []);

  const handleAuthResult = useCallback((result: "success" | "error" | null) => {
    if (authResultTimeoutRef.current) {
      clearTimeout(authResultTimeoutRef.current);
    }

    if (result === "success") {
      setState("success");
      authResultTimeoutRef.current = window.setTimeout(() => {
        setState(pointerPosition ? "pointerTracking" : "idle");
      }, 1500);
    } else if (result === "error") {
      setState("error");
      authResultTimeoutRef.current = window.setTimeout(() => {
        setState("passwordFocused");
      }, 2000);
    } else {
      setState(pointerPosition ? "pointerTracking" : "idle");
    }
  }, [pointerPosition]);

  const handlePointerMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (reducedMotion || isSubmitting) return;

    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
      setPointerPosition({ x, y });
      if (state === "idle") {
        setState("pointerTracking");
      }
    }
  }, [reducedMotion, isSubmitting, state]);

  const handlePointerLeave = useCallback(() => {
    if (reducedMotion) return;

    setPointerPosition(null);
    if (state === "pointerTracking") {
      setState("idle");
    }
  }, [reducedMotion, state]);

  return {
    state,
    pointerPosition,
    reducedMotion,
    setFieldFocus,
    setPasswordVisible: handlePasswordVisibleChange,
    setSubmitting: handleSubmittingChange,
    setAuthResult: handleAuthResult,
    handlePointerMove,
    handlePointerLeave,
    sceneRef,
  };
};

export default useCharacterAnimation;