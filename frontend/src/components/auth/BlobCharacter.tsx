import React, { useEffect, useRef, useState } from "react";

export type CharacterType = "orange-dome" | "purple-pillar" | "pink-pillar" | "yellow-pillar";

export type CharacterState =
  | "idle"
  | "pointerTracking"
  | "emailFocused"
  | "passwordFocused"
  | "passwordVisible"
  | "submitting"
  | "success"
  | "error";

interface BlobCharacterProps {
  type: CharacterType;
  state: CharacterState;
  pointerPosition: { x: number; y: number } | null;
  characterRect: DOMRect | null;
  reducedMotion: boolean;
  sceneRect: DOMRect | null;
}

const CHARACTER_CONFIG: Record<CharacterType, {
  color: string;
  colorLight: string;
  colorDark: string;
  eyeOffsetX: number;
  eyeOffsetY: number;
  eyeSpacing: number;
  eyeRadius: number;
  pupilRadius: number;
  bodyWidth: number;
  bodyHeight: number;
  borderRadius: string;
  trackingStrength: number;
  idleBounce: boolean;
  idleSway: boolean;
  idleFloat: boolean;
}> = {
  "orange-dome": {
    color: "#f97316",
    colorLight: "#fb923c",
    colorDark: "#ea580c",
    eyeOffsetX: 0,
    eyeOffsetY: -18,
    eyeSpacing: 22,
    eyeRadius: 10,
    pupilRadius: 5,
    bodyWidth: 80,
    bodyHeight: 60,
    borderRadius: "50% 50% 40% 40% / 60% 60% 40% 40%",
    trackingStrength: 0.35,
    idleBounce: true,
    idleSway: false,
    idleFloat: false,
  },
  "purple-pillar": {
    color: "#a855f7",
    colorLight: "#c084fc",
    colorDark: "#9333ea",
    eyeOffsetX: 0,
    eyeOffsetY: -28,
    eyeSpacing: 24,
    eyeRadius: 11,
    pupilRadius: 5.5,
    bodyWidth: 56,
    bodyHeight: 100,
    borderRadius: "28px 28px 18px 18px",
    trackingStrength: 0.3,
    idleBounce: false,
    idleSway: false,
    idleFloat: true,
  },
  "pink-pillar": {
    color: "#ec4899",
    colorLight: "#f472b6",
    colorDark: "#db2777",
    eyeOffsetX: 0,
    eyeOffsetY: -24,
    eyeSpacing: 20,
    eyeRadius: 9,
    pupilRadius: 4.5,
    bodyWidth: 48,
    bodyHeight: 84,
    borderRadius: "24px 24px 16px 16px",
    trackingStrength: 0.4,
    idleBounce: false,
    idleSway: true,
    idleFloat: false,
  },
  "yellow-pillar": {
    color: "#eab308",
    colorLight: "#facc15",
    colorDark: "#ca8a04",
    eyeOffsetX: 0,
    eyeOffsetY: -22,
    eyeSpacing: 22,
    eyeRadius: 10,
    pupilRadius: 5,
    bodyWidth: 52,
    bodyHeight: 76,
    borderRadius: "26px 26px 18px 18px",
    trackingStrength: 0.25,
    idleBounce: true,
    idleSway: false,
    idleFloat: false,
  },
};

const POSITIONS: Record<CharacterType, { x: number; y: number; zIndex: number }> = {
  "orange-dome": { x: 15, y: 55, zIndex: 4 },
  "purple-pillar": { x: 35, y: 15, zIndex: 1 },
  "pink-pillar": { x: 55, y: 40, zIndex: 3 },
  "yellow-pillar": { x: 75, y: 28, zIndex: 2 },
};

export const BlobCharacter: React.FC<BlobCharacterProps> = ({
  type,
  state,
  pointerPosition,
  characterRect,
  reducedMotion,
  sceneRect,
}) => {
  const config = CHARACTER_CONFIG[type];
  const position = POSITIONS[type];
  const characterRef = useRef<HTMLDivElement>(null);
  const leftEyeRef = useRef<HTMLDivElement>(null);
  const rightEyeRef = useRef<HTMLDivElement>(null);
  const leftPupilRef = useRef<HTMLDivElement>(null);
  const rightPupilRef = useRef<HTMLDivElement>(null);
  const mouthRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [expression, setExpression] = useState<{
    eyeScale: number;
    eyeSquint: number;
    mouthType: "smile" | "nervous" | "shy" | "surprised" | "polite" | "neutral";
    bodyScale: number;
    bodyOffsetY: number;
    bodyRotate: number;
  }>({
    eyeScale: 1,
    eyeSquint: 0,
    mouthType: "smile",
    bodyScale: 1,
    bodyOffsetY: 0,
    bodyRotate: 0,
  });
  const [blinkPhase, setBlinkPhase] = useState(0);
  const [idlePhase, setIdlePhase] = useState(0);

  const animationFrameRef = useRef<number | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const targetPupilOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (reducedMotion) {
      setExpression({
        eyeScale: 1,
        eyeSquint: 0,
        mouthType: "smile",
        bodyScale: 1,
        bodyOffsetY: 0,
        bodyRotate: 0,
      });
      return;
    }

    const handleFrame = () => {
      setIdlePhase((prev) => prev + 0.016);
      setBlinkPhase((prev) => prev + 0.016);

      const blinkCycle = Math.sin(blinkPhase * 0.5) > 0.95 ? 0 : 1;

      let targetX = 0;
      let targetY = 0;
      let newExpression = { ...expression };
      let newBodyOffsetY = 0;
      let newBodyRotate = 0;
      let newBodyScale = 1;

      switch (state) {
        case "idle":
        case "pointerTracking":
          if (pointerPosition && sceneRect && characterRect) {
            const charCenterX = characterRect.left - sceneRect.left + characterRect.width / 2;
            const charCenterY = characterRect.top - sceneRect.top + characterRect.height / 2;
            const dx = pointerPosition.x - charCenterX;
            const dy = pointerPosition.y - charCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDistance = Math.min(sceneRect.width, sceneRect.height) * 0.5;
            const strength = Math.min(1, distance / maxDistance) * config.trackingStrength;
            const maxPupilOffset = config.eyeRadius - config.pupilRadius - 1;
            targetX = (dx / (distance || 1)) * maxPupilOffset * strength;
            targetY = (dy / (distance || 1)) * maxPupilOffset * strength;
          }
          newExpression.mouthType = "smile";
          newExpression.eyeSquint = 0;
          newExpression.eyeScale = blinkCycle;
          break;

        case "emailFocused":
          if (pointerPosition && sceneRect && characterRect) {
            const charCenterX = characterRect.left - sceneRect.left + characterRect.width / 2;
            const charCenterY = characterRect.top - sceneRect.top + characterRect.height / 2;
            const dx = pointerPosition.x - charCenterX;
            const dy = pointerPosition.y - charCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDistance = Math.min(sceneRect.width, sceneRect.height) * 0.5;
            const strength = Math.min(1, distance / maxDistance) * config.trackingStrength * 0.5;
            const maxPupilOffset = config.eyeRadius - config.pupilRadius - 1;
            targetX = (dx / (distance || 1)) * maxPupilOffset * strength;
            targetY = (dy / (distance || 1)) * maxPupilOffset * strength;
          }
          newExpression.mouthType = "smile";
          newExpression.eyeSquint = 0;
          newExpression.eyeScale = blinkCycle;
          break;

        case "passwordFocused":
          newExpression.mouthType = type === "orange-dome" ? "shy" :
            type === "purple-pillar" ? "surprised" :
            type === "pink-pillar" ? "nervous" : "polite";
          newExpression.eyeSquint = type === "orange-dome" ? 1 : 0;
          newExpression.eyeScale = type === "orange-dome" ? 0.3 : 1;
          newExpression.eyeScale *= blinkCycle;

          if (type === "orange-dome") {
            newBodyOffsetY = 3;
            newBodyRotate = -5;
            newBodyScale = 0.95;
          } else if (type === "purple-pillar") {
            newBodyOffsetY = -4;
            newBodyScale = 1.05;
          } else if (type === "pink-pillar") {
            newBodyRotate = 3;
            newBodyScale = 0.98;
          } else if (type === "yellow-pillar") {
            newBodyRotate = -8;
            newBodyOffsetY = 2;
          }
          break;

        case "passwordVisible":
          newExpression.mouthType = "surprised";
          newExpression.eyeScale = 1.2 * blinkCycle;
          newExpression.eyeSquint = 0;
          break;

        case "submitting":
          newExpression.mouthType = "neutral";
          newExpression.eyeScale = blinkCycle;
          newExpression.eyeSquint = 0;
          break;

        case "success":
          newExpression.mouthType = "smile";
          newExpression.eyeScale = 1.1 * blinkCycle;
          newExpression.eyeSquint = 0;
          newBodyScale = 1.02;
          newBodyOffsetY = -2;
          break;

        case "error":
          newExpression.mouthType = "nervous";
          newExpression.eyeScale = blinkCycle;
          newExpression.eyeSquint = 0;
          newBodyRotate = Math.sin(idlePhase * 10) * 3;
          break;
      }

      targetPupilOffsetRef.current = { x: targetX, y: targetY };
      const smoothFactor = 0.15;
      setPupilOffset((prev) => ({
        x: prev.x + (targetX - prev.x) * smoothFactor,
        y: prev.y + (targetY - prev.y) * smoothFactor,
      }));

      setExpression(newExpression);
      setBodyOffsetY(newBodyOffsetY);
      setBodyRotate(newBodyRotate);
      setBodyScale(newBodyScale);

      animationFrameRef.current = requestAnimationFrame(handleFrame);
    };

    animationFrameRef.current = requestAnimationFrame(handleFrame);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    state,
    pointerPosition,
    characterRect,
    sceneRect,
    reducedMotion,
    config.trackingStrength,
    config.eyeRadius,
    config.pupilRadius,
    expression,
    idlePhase,
    blinkPhase,
    type,
  ]);

  const setBodyOffsetY = (y: number) => setExpression((prev) => ({ ...prev, bodyOffsetY: y }));
  const setBodyRotate = (r: number) => setExpression((prev) => ({ ...prev, bodyRotate: r }));
  const setBodyScale = (s: number) => setExpression((prev) => ({ ...prev, bodyScale: s }));

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: `translate(-50%, -50%) translateY(${expression.bodyOffsetY}px) rotate(${expression.bodyRotate}deg) scale(${expression.bodyScale})`,
    transformOrigin: "center bottom",
    zIndex: position.zIndex,
    transition: reducedMotion ? "none" : "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)",
    pointerEvents: "none",
  };

  const bodyStyle: React.CSSProperties = {
    width: config.bodyWidth,
    height: config.bodyHeight,
    background: `linear-gradient(135deg, ${config.colorLight} 0%, ${config.color} 50%, ${config.colorDark} 100%)`,
    borderRadius: config.borderRadius,
    boxShadow: `
      0 4px 16px -4px ${config.colorDark}80,
      inset 0 -8px 16px -8px ${config.colorDark}40,
      inset 0 4px 8px -4px ${config.colorLight}60
    `,
    position: "relative",
    transform: reducedMotion ? "none" : (
      config.idleBounce
        ? `translateY(${Math.sin(idlePhase * 2) * 2}px)`
        : config.idleFloat
        ? `translateY(${Math.sin(idlePhase * 1.5) * 3}px)`
        : config.idleSway
        ? `translateX(${Math.sin(idlePhase * 1.8) * 2}px)`
        : "none"
    ),
    transition: reducedMotion ? "none" : "transform 200ms ease-out",
  };

  const eyeStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: `translate(-50%, -50%) translate(${config.eyeOffsetX}px, ${config.eyeOffsetY}px)`,
    display: "flex",
    gap: config.eyeSpacing,
    pointerEvents: "none",
  };

  const singleEyeStyle = (side: "left" | "right"): React.CSSProperties => ({
    width: config.eyeRadius * 2,
    height: config.eyeRadius * 2 * expression.eyeScale,
    borderRadius: "50%",
    background: "#ffffff",
    position: "relative",
    boxShadow: `inset 0 2px 4px ${config.colorDark}30`,
    overflow: "hidden",
    transform: `scaleY(${1 - expression.eyeSquint * 0.7})`,
    transition: reducedMotion ? "none" : "transform 150ms ease-out",
  });

  const pupilStyle = (side: "left" | "right"): React.CSSProperties => ({
    position: "absolute",
    top: "50%",
    left: "50%",
    width: config.pupilRadius * 2,
    height: config.pupilRadius * 2,
    borderRadius: "50%",
    background: "#1a1a2e",
    transform: `translate(-50%, -50%) translate(${pupilOffset.x}px, ${pupilOffset.y}px)`,
    transition: reducedMotion ? "none" : "transform 80ms ease-out",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)",
  });

  const highlightStyle: React.CSSProperties = {
    position: "absolute",
    top: "20%",
    left: "20%",
    width: config.pupilRadius * 0.8,
    height: config.pupilRadius * 0.8,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.9)",
    pointerEvents: "none",
  };

  const mouthStyle: React.CSSProperties = {
    position: "absolute",
    bottom: "18%",
    left: "50%",
    transform: "translateX(-50%)",
    pointerEvents: "none",
  };

  const getMouthPath = () => {
    const w = config.bodyWidth * 0.35;
    const h = config.bodyHeight * 0.12;
    switch (expression.mouthType) {
      case "smile":
        return `M ${-w / 2} 0 Q 0 ${h} ${w / 2} 0`;
      case "shy":
        return `M ${-w / 2} 0 Q 0 ${-h * 0.5} ${w / 2} 0`;
      case "surprised":
        return `M ${-w * 0.4} ${-h * 0.3} Q 0 ${h * 0.8} ${w * 0.4} ${-h * 0.3}`;
      case "nervous":
        return `M ${-w / 2} ${h * 0.2} Q 0 0 ${w / 2} ${h * 0.2}`;
      case "polite":
        return `M ${-w * 0.3} 0 Q 0 ${h * 0.3} ${w * 0.3} 0`;
      default:
        return `M ${-w / 2} 0 Q 0 ${h * 0.3} ${w / 2} 0`;
    }
  };

  const mouthColor = expression.mouthType === "shy" ? config.colorDark : "#1a1a2e";

  return (
    <div ref={characterRef} style={style} className="blob-character">
      <div ref={bodyRef} style={bodyStyle} className="blob-body">
        <div style={eyeStyle} className="blob-eyes">
          <div ref={leftEyeRef} style={singleEyeStyle("left")} className="blob-eye">
            <div ref={leftPupilRef} style={pupilStyle("left")} className="blob-pupil">
              <div style={highlightStyle} className="blob-highlight" />
            </div>
          </div>
          <div ref={rightEyeRef} style={singleEyeStyle("right")} className="blob-eye">
            <div ref={rightPupilRef} style={pupilStyle("right")} className="blob-pupil">
              <div style={highlightStyle} className="blob-highlight" />
            </div>
          </div>
        </div>
        <div ref={mouthRef} style={mouthStyle} className="blob-mouth">
          <svg
            width={config.bodyWidth * 0.5}
            height={config.bodyHeight * 0.2}
            style={{ overflow: "visible" }}
            aria-hidden="true"
          >
            <path
              d={getMouthPath()}
              stroke={mouthColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
              style={{
                filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.1))",
                transition: reducedMotion ? "none" : "stroke 200ms ease-out, d 300ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
          </svg>
        </div>
        {/* Cheeks for orange dome when shy */}
        {type === "orange-dome" && expression.mouthType === "shy" && (
          <>
            <div
              style={{
                position: "absolute",
                top: "55%",
                left: "10%",
                width: 12,
                height: 8,
                borderRadius: "50%",
                background: "rgba(234, 88, 12, 0.3)",
                filter: "blur(2px)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "55%",
                right: "10%",
                width: 12,
                height: 8,
                borderRadius: "50%",
                background: "rgba(234, 88, 12, 0.3)",
                filter: "blur(2px)",
                pointerEvents: "none",
              }}
            />
          </>
        )}
      </div>
      {/* Contact shadow */}
      <div
        style={{
          position: "absolute",
          bottom: -8,
          left: "50%",
          transform: "translateX(-50%) scaleX(0.7)",
          width: config.bodyWidth * 0.8,
          height: 8,
          borderRadius: "50%",
          background: "rgba(15, 23, 42, 0.08)",
          filter: "blur(4px)",
          pointerEvents: "none",
          opacity: reducedMotion ? 0.5 : 1,
        }}
        aria-hidden="true"
      />
    </div>
  );
};

export default BlobCharacter;