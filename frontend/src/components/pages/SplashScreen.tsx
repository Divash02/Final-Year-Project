import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";

interface Props {
  onComplete: () => void;
}

const easeOut = [0.22, 1, 0.36, 1] as const;
const easeCinematic = [0.16, 1, 0.3, 1] as const;
const easeInOut = [0.42, 0, 0.58, 1] as const;

const containerVariants = {
  hidden: { opacity: 0, scale: 0.88, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 140, damping: 18, mass: 1.1 },
  },
  exit: {
    opacity: 0,
    y: -18,
    transition: { duration: 0.65, ease: easeOut },
  },
};

const shadowVariants = {
  hidden: { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  visible: {
    boxShadow: "0 28px 72px rgba(0,0,0,0.3), 0 0 48px rgba(131,0,0,0.22), 0 6px 20px rgba(0,0,0,0.1)",
    transition: { duration: 0.9, ease: easeOut, delay: 0.15 },
  },
};

const backgroundGlowVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: {
    opacity: 0.55,
    scale: 1,
    transition: { duration: 1.2, ease: easeOut, delay: 0.1 },
  },
  ambient: {
    opacity: [0.45, 0.65, 0.45],
    scale: [0.96, 1.04, 0.96],
    transition: { duration: 7, ease: easeInOut, repeat: Infinity, repeatType: "reverse" as const },
  },
};

export const SplashScreen: React.FC<Props> = ({ onComplete }) => {
  const prefersReduced = useReducedMotion();
  const [revealStage, setRevealStage] = useState<"idle" | "container" | "logo" | "complete">("idle");
  const [exiting, setExiting] = useState(false);
  const completed = useRef(false);

  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    setExiting(true);
    const exitDuration = prefersReduced ? 180 : 650;
    setTimeout(() => onComplete(), exitDuration);
  }, [onComplete, prefersReduced]);

  useEffect(() => {
    if (prefersReduced) {
      setRevealStage("complete");
      const timer = setTimeout(finish, 450);
      return () => clearTimeout(timer);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setRevealStage("container"), 150));
    timers.push(setTimeout(() => setRevealStage("logo"), 450));
    timers.push(setTimeout(() => setRevealStage("complete"), 1900));
    timers.push(setTimeout(finish, 1900));

    return () => timers.forEach(clearTimeout);
  }, [finish, prefersReduced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter" || e.code === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const containerStyle = {
    width: "clamp(10rem, 35vw, 16rem)",
    height: "clamp(10rem, 35vw, 16rem)",
    borderRadius: "1.5rem",
    backgroundColor: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative" as const,
  };

  const logoSize = "clamp(5.5rem, 20vw, 9.5rem)";

  const logoMaskStyle = {
    width: logoSize,
    height: logoSize,
    maskImage: "linear-gradient(135deg, black var(--mask-progress, 0%), transparent var(--mask-progress, 0%))",
    WebkitMaskImage: "linear-gradient(135deg, black var(--mask-progress, 0%), transparent var(--mask-progress, 0%))",
    maskSize: "200% 200%",
    WebkitMaskSize: "200% 200%",
    maskPosition: "0% 0%",
    WebkitMaskPosition: "0% 0%",
  } as React.CSSProperties;

  return (
    <AnimatePresence mode="wait">
      {!exiting && (
        <motion.div
          className="fixed inset-0 z-[9999] overflow-hidden select-none"
          style={{ backgroundColor: "#830000" }}
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: prefersReduced ? 0.18 : 0.6, ease: "easeInOut" } }}
          aria-label="Techspire loading"
          role="status"
          aria-live="polite"
        >
          {/* Deep cinematic background edges - preserved from original */}
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{
              background:
                "radial-gradient(ellipse 120% 100% at 50% 50%, rgba(0,0,0,0) 38%, rgba(28,6,14,0.55) 100%)",
            }}
          />

          {/* Subtle ambient glow behind container */}
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
            aria-hidden="true"
            style={{
              width: "min(80vw, 38rem)",
              height: "min(80vw, 38rem)",
              background:
                "radial-gradient(circle, rgba(181,43,69,0.22) 0%, rgba(148,27,50,0.06) 42%, rgba(0,0,0,0) 72%)",
              filter: "blur(2px)",
            }}
            variants={backgroundGlowVariants}
            initial="hidden"
            animate={revealStage === "idle" ? "hidden" : revealStage === "complete" ? "ambient" : "visible"}
          />

          {/* Centered white container with entrance animation */}
          <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
            <AnimatePresence mode="wait">
              <motion.div
                key="container"
                style={containerStyle}
                variants={containerVariants}
                initial="hidden"
                animate={revealStage === "idle" ? "hidden" : "visible"}
                exit="exit"
              >
                {/* Animated shadow emergence */}
                <motion.div
                  className="absolute inset-0 rounded-[1.5rem] pointer-events-none"
                  variants={shadowVariants}
                  initial="hidden"
                  animate={revealStage === "container" || revealStage === "logo" || revealStage === "complete" ? "visible" : "hidden"}
                />

                {/* Logo with cinematic progressive reveal */}
                <div
                  className="relative flex items-center justify-center"
                  style={{ width: logoSize, height: logoSize }}
                >
                  {/* Mask wrapper for progressive reveal */}
                  <motion.div
                    style={{
                      ...logoMaskStyle,
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    animate={{ "--mask-progress": revealStage === "logo" || revealStage === "complete" ? "100%" : "0%" }}
                    transition={{
                      "--mask-progress": { duration: 1.4, ease: easeCinematic, delay: 0.15 },
                    }}
                  >
                    <motion.img
                      src="/images/techspirecollege.png"
                      alt="Techspire"
                      className="relative h-auto max-w-full rounded-xl object-contain"
                      style={{
                        width: logoSize,
                        boxShadow:
                          "0 18px 48px rgba(0,0,0,0.28), 0 0 32px rgba(131,0,0,0.3), 0 2px 12px rgba(0,0,0,0.15)",
                      }}
                      draggable={false}
                      decoding="async"
                      initial={revealStage === "idle" || revealStage === "container" ? { opacity: 0, scale: 0.95 } : { opacity: 1, scale: 1 }}
                      animate={{
                        opacity: revealStage === "logo" || revealStage === "complete" ? 1 : 0,
                        scale: revealStage === "logo" ? 1.01 : revealStage === "complete" ? 1 : 0.95,
                      }}
                      transition={{
                        opacity: { duration: 0.25, ease: "easeOut", delay: 0.25 },
                        scale: { duration: 0.7, ease: easeOut, delay: 0.3 },
                      }}
                    />
                  </motion.div>

                  {/* Subtle crimson light sweep during reveal */}
                  {revealStage === "logo" && (
                    <motion.div
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      aria-hidden="true"
                      style={{
                        background: "linear-gradient(135deg, rgba(172,32,27,0) 40%, rgba(172,32,27,0.18) 50%, rgba(172,32,27,0) 60%)",
                        backgroundSize: "200% 200%",
                      }}
                      initial={{ opacity: 0, backgroundPosition: "0% 0%" }}
                      animate={{ opacity: [0, 1, 0], backgroundPosition: ["0% 0%", "100% 100%", "100% 100%"] }}
                      transition={{
                        opacity: { duration: 1.4, ease: easeCinematic },
                        backgroundPosition: { duration: 1.4, ease: easeCinematic },
                      }}
                    />
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};