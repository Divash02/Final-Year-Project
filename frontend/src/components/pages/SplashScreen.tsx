import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

interface Props {
  onComplete: () => void;
}

/**
 * Premium cinematic splash for CollegeOS.
 * Reuses the existing logo asset and transitions to the existing Welcome page
 * via `onComplete` after the entrance animation settles. No artificial load delay.
 */
export const SplashScreen: React.FC<Props> = ({ onComplete }) => {
  const prefersReduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completed = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    clearTimers();
    setExiting(true);
    timers.current.push(
      setTimeout(() => {
        onComplete();
      }, prefersReduced ? 180 : 520),
    );
  }, [clearTimers, onComplete, prefersReduced]);

  useEffect(() => {
    // Logo entrance is real animation time (not an artificial loading delay).
    // Reduced motion users get an immediate, brief presentation.
    const settleMs = prefersReduced ? 450 : 1900;
    timers.current.push(setTimeout(() => setReady(true), prefersReduced ? 0 : 120));
    timers.current.push(setTimeout(finish, settleMs));
    return clearTimers;
  }, [clearTimers, finish, prefersReduced]);

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

  const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];

  return (
    <motion.div
      className="fixed inset-0 z-[9999] overflow-hidden select-none"
      style={{ backgroundColor: "#830000" }}
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: prefersReduced ? 0.18 : 0.52, ease: "easeInOut" }}
      aria-label="CollegeOS loading"
      role="status"
      aria-live="polite"
    >
      {/* Subtle darker cinematic edges */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 120% 100% at 50% 50%, rgba(0,0,0,0) 38%, rgba(28,6,14,0.55) 100%)",
        }}
      />

      {/* Soft ambient light behind logo */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        aria-hidden="true"
        style={{
          width: "min(72vw, 34rem)",
          height: "min(72vw, 34rem)",
          background:
            "radial-gradient(circle, rgba(181,43,69,0.32) 0%, rgba(148,27,50,0.12) 42%, rgba(0,0,0,0) 72%)",
          filter: "blur(2px)",
        }}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={
          prefersReduced
            ? { opacity: 0.85, scale: 1 }
            : { opacity: ready ? [0.55, 0.85, 0.7] : 0.55, scale: ready ? 1 : 0.94 }
        }
        transition={
          prefersReduced
            ? { duration: 0.2 }
            : { opacity: { duration: 2.4, ease: "easeInOut" }, scale: { duration: 1.1, ease: easeOut } }
        }
      />

      {/* Centered logo */}
      <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
        <motion.div
          className="relative flex items-center justify-center"
          initial={prefersReduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: ready || prefersReduced ? 1 : 0, scale: 1 }}
          transition={{ duration: prefersReduced ? 0.15 : 1.05, ease: easeOut }}
        >
          {/* Glow / light reveal behind logo */}
          <motion.div
            className="absolute rounded-full pointer-events-none"
            aria-hidden="true"
            style={{
              width: "clamp(8.5rem, 28vw, 13rem)",
              height: "clamp(8.5rem, 28vw, 13rem)",
              background:
                "radial-gradient(circle, rgba(255,255,255,0.14) 0%, rgba(181,43,69,0.18) 45%, rgba(0,0,0,0) 70%)",
            }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: ready || prefersReduced ? 1 : 0, scale: 1.12 }}
            transition={{ duration: prefersReduced ? 0.15 : 1.2, ease: easeOut, delay: prefersReduced ? 0 : 0.08 }}
          />
          <img
            src="/images/techspirecollege.png"
            alt="CollegeOS"
            className="relative h-auto w-[clamp(6.5rem,22vw,10.5rem)] max-w-full rounded-2xl object-contain"
            style={{
              boxShadow:
                "0 18px 48px rgba(0,0,0,0.32), 0 0 28px rgba(131,0,0,0.35), 0 2px 10px rgba(0,0,0,0.18)",
            }}
            draggable={false}
            decoding="async"
          />
        </motion.div>
      </div>
    </motion.div>
  );
};