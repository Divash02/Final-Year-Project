import React, { useEffect, useRef, useState, useCallback } from "react";
import { BlobCharacter, CharacterType, CharacterState } from "./BlobCharacter";
import { BrandLogo } from "../common/BrandLogo";

interface LoginIllustrationSceneProps {
  state: CharacterState;
  pointerPosition: { x: number; y: number } | null;
  reducedMotion: boolean;
}

const CHARACTER_TYPES: CharacterType[] = [
  "orange-dome",
  "purple-pillar",
  "pink-pillar",
  "yellow-pillar",
];

const statePriority: Record<CharacterState, number> = {
  error: 8,
  success: 7,
  submitting: 6,
  passwordVisible: 5,
  passwordFocused: 4,
  emailFocused: 3,
  pointerTracking: 2,
  idle: 1,
};

export const LoginIllustrationScene: React.FC<LoginIllustrationSceneProps> = ({
  state,
  pointerPosition,
  reducedMotion,
}) => {
  const sceneRef = useRef<HTMLDivElement>(null);
  const characterRectsRef = useRef<Record<CharacterType, DOMRect | null>>({
    "orange-dome": null,
    "purple-pillar": null,
    "pink-pillar": null,
    "yellow-pillar": null,
  });
  const [sceneRect, setSceneRect] = useState<DOMRect | null>(null);

  const updateRects = useCallback(() => {
    if (sceneRef.current) {
      setSceneRect(sceneRef.current.getBoundingClientRect());
    }
    CHARACTER_TYPES.forEach((type) => {
      const el = document.querySelector(`[data-character="${type}"]`);
      if (el) {
        characterRectsRef.current[type] = el.getBoundingClientRect();
      }
    });
  }, []);

  useEffect(() => {
    updateRects();
    const handleResize = () => updateRects();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateRects]);

  useEffect(() => {
    if (!reducedMotion) {
      const interval = setInterval(updateRects, 1000);
      return () => clearInterval(interval);
    }
  }, [reducedMotion, updateRects]);

  return (
    <div
      ref={sceneRef}
      className="relative w-full h-full min-h-[400px] bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 rounded-2xl overflow-hidden"
      role="img"
      aria-label="Four friendly blob characters welcoming you to CollegeOS"
      data-testid="login-illustration-scene"
    >
      {/* Subtle decorative shapes */}
      {!reducedMotion && (
        <>
          <div
            className="absolute top-10 left-10 w-16 h-16 rounded-full bg-white/30 blur-2xl"
            aria-hidden="true"
            style={{ animation: "float 8s ease-in-out infinite" }}
          />
          <div
            className="absolute top-20 right-16 w-12 h-12 rounded-full bg-white/20 blur-2xl"
            aria-hidden="true"
            style={{ animation: "float 10s ease-in-out infinite reverse" }}
          />
          <div
            className="absolute bottom-20 left-20 w-10 h-10 rounded-full bg-white/25 blur-2xl"
            aria-hidden="true"
            style={{ animation: "float 7s ease-in-out infinite" }}
          />
          <div
            className="absolute bottom-16 right-12 w-14 h-14 rounded-full bg-white/15 blur-2xl"
            aria-hidden="true"
            style={{ animation: "float 9s ease-in-out infinite reverse" }}
          />
        </>
      )}

      {/* CollegeOS brand mark */}
      <div
        className="absolute top-6 left-6 z-10 flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-sm backdrop-blur-sm border border-white/50"
        aria-hidden="true"
      >
        <BrandLogo size={28} bordered className="rounded-lg" />
        <span className="text-xs font-semibold tracking-wider text-slate-600">COLLEGEOS</span>
      </div>

      {/* Character group */}
      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{ perspective: "1000px" }}
      >
        {CHARACTER_TYPES.map((type) => (
          <BlobCharacter
            key={type}
            type={type}
            state={state}
            pointerPosition={pointerPosition}
            characterRect={characterRectsRef.current[type]}
            reducedMotion={reducedMotion}
            sceneRect={sceneRect}
          />
        ))}
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(10px, -10px) scale(1.05); }
          50% { transform: translate(-5px, 15px) scale(0.95); }
          75% { transform: translate(-10px, -5px) scale(1.02); }
        }
      `}</style>
    </div>
  );
};

export default LoginIllustrationScene;