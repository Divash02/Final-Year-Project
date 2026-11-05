/**
 * SplashScreen.tsx
 *
 * Cinematic animated splash introduction for Techspire College / CollegeOS.
 * Uses the `motion` library (Motion for React) which is already installed.
 *
 * Animation sequence (≈6 s total):
 *  0.0 s  — Atmospheric background fades in
 *  0.4 s  — Particle field activates
 *  0.8 s  — Logo scale-and-fade reveal
 *  1.8 s  — College name staggered letter reveal
 *  2.6 s  — Slogan fade-rise
 *  3.2 s  — Description fade
 *  4.4 s  — Light sweep across logo
 *  5.2 s  — onComplete callback fired → parent transitions to WelcomePage
 *
 * Respects prefers-reduced-motion: collapses the full sequence to a simple
 * 1.5 s cross-fade when motion is reduced.
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useReducer,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

interface Props {
  onComplete: () => void;
}

/* ─────────────────────────── particle helpers ──────────────────────────── */

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    opacity: Math.random() * 0.5 + 0.1,
    duration: Math.random() * 8 + 6,
    delay: Math.random() * 4,
  }));
}

const PARTICLES = generateParticles(55);

/* ─────────────────────────── letter helpers ────────────────────────────── */

const COLLEGE_NAME = "Techspire College";

/* ─────────────────────────── component ────────────────────────────────── */

export const SplashScreen: React.FC<Props> = ({ onComplete }) => {
  const prefersReduced = useReducedMotion();
  const [skipped, skip] = useReducer(() => true, false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState(0); // animation phase 0-6
  const [exiting, setExiting] = useState(false);

  /* ── Advance phases on a timeline ───────────────────────────────────── */
  const advance = useCallback(
    (toPhase: number, delay: number) => {
      if (prefersReduced) return; // in reduced-motion mode we skip the timeline
      timerRef.current = setTimeout(() => setPhase(toPhase), delay);
    },
    [prefersReduced],
  );

  useEffect(() => {
    if (prefersReduced || skipped) {
      // Instant or very fast — 1.2 s static display then done
      timerRef.current = setTimeout(() => {
        setExiting(true);
        timerRef.current = setTimeout(onComplete, 600);
      }, 1200);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    // Full timeline
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, fn: () => void) => {
      const t = setTimeout(fn, ms);
      timers.push(t);
    };

    after(400, () => setPhase(1)); // particles visible
    after(800, () => setPhase(2)); // logo reveal
    after(1900, () => setPhase(3)); // name reveal
    after(2700, () => setPhase(4)); // slogan
    after(3300, () => setPhase(5)); // description
    after(5200, () => {
      setExiting(true);
      after(600, onComplete);
    });

    return () => timers.forEach(clearTimeout);
  }, [prefersReduced, skipped, advance, onComplete]);

  /* ── Skip handler ───────────────────────────────────────────────────── */
  const handleSkip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    skip();
    setExiting(true);
    timerRef.current = setTimeout(onComplete, 400);
  }, [onComplete]);

  /* ── Keyboard skip (Space / Enter / Escape) ─────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["Space", "Enter", "Escape"].includes(e.code)) handleSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSkip]);

  /* ─────────────────────── render ───────────────────────────────────── */
  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[9999] overflow-hidden select-none"
          style={{ background: "#0a0f1e" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          aria-label="Techspire College introduction"
          role="presentation"
        >
          {/* ── Animated gradient mesh ──────────────────────────────────── */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Deep background gradient */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 80% 70% at 50% -10%, rgba(172,32,27,0.18) 0%, transparent 70%), " +
                  "radial-gradient(ellipse 60% 50% at 90% 90%, rgba(16,36,74,0.5) 0%, transparent 60%), " +
                  "radial-gradient(ellipse 50% 60% at 10% 80%, rgba(172,32,27,0.08) 0%, transparent 60%)",
              }}
            />

            {/* Slow-drifting orb 1 */}
            <motion.div
              className="absolute rounded-full blur-3xl pointer-events-none"
              style={{
                width: 600,
                height: 600,
                top: "-15%",
                left: "-10%",
                background:
                  "radial-gradient(circle, rgba(172,32,27,0.22) 0%, transparent 70%)",
              }}
              animate={
                prefersReduced
                  ? {}
                  : {
                      x: [0, 40, -20, 0],
                      y: [0, 30, 50, 0],
                    }
              }
              transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Slow-drifting orb 2 */}
            <motion.div
              className="absolute rounded-full blur-3xl pointer-events-none"
              style={{
                width: 500,
                height: 500,
                bottom: "-10%",
                right: "-8%",
                background:
                  "radial-gradient(circle, rgba(16,36,74,0.4) 0%, transparent 70%)",
              }}
              animate={
                prefersReduced
                  ? {}
                  : {
                      x: [0, -50, 20, 0],
                      y: [0, -30, 40, 0],
                    }
              }
              transition={{
                duration: 25,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 2,
              }}
            />

            {/* Geometric SVG lines */}
            <svg
              className="absolute inset-0 w-full h-full opacity-5"
              viewBox="0 0 1200 800"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
            >
              <line
                x1="0"
                y1="400"
                x2="1200"
                y2="400"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="0.5"
              />
              <line
                x1="600"
                y1="0"
                x2="600"
                y2="800"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="0.5"
              />
              <circle
                cx="600"
                cy="400"
                r="280"
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="0.5"
              />
              <circle
                cx="600"
                cy="400"
                r="380"
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="0.5"
              />
              <polygon
                points="600,120 870,580 330,580"
                fill="none"
                stroke="rgba(172,32,27,0.25)"
                strokeWidth="0.5"
              />
            </svg>

            {/* Particle field */}
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase >= 1 ? 1 : 0 }}
              transition={{ duration: 1.2 }}
            >
              {PARTICLES.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    width: p.size,
                    height: p.size,
                    background: "rgba(255,255,255,0.8)",
                  }}
                  animate={
                    prefersReduced
                      ? { opacity: p.opacity }
                      : {
                          opacity: [0, p.opacity, 0],
                          y: [0, -18, 0],
                        }
                  }
                  transition={
                    prefersReduced
                      ? {}
                      : {
                          duration: p.duration,
                          delay: p.delay,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }
                  }
                />
              ))}
            </motion.div>

            {/* Horizontal light sweep */}
            {!prefersReduced && phase >= 3 && (
              <motion.div
                className="absolute inset-y-0 w-32 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)",
                }}
                initial={{ left: "-20%" }}
                animate={{ left: "120%" }}
                transition={{ duration: 2.5, ease: "easeInOut", delay: 0.3 }}
              />
            )}
          </div>

          {/* ── Main content ─────────────────────────────────────────────── */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center">
            {/* Logo */}
            <motion.div
              className="mb-8 relative"
              initial={{ opacity: 0, scale: 0.72, filter: "blur(8px)" }}
              animate={
                phase >= 2
                  ? { opacity: 1, scale: 1, filter: "blur(0px)" }
                  : prefersReduced
                    ? { opacity: 1, scale: 1, filter: "blur(0px)" }
                    : {}
              }
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Glow behind logo */}
              <div
                className="absolute inset-0 rounded-2xl blur-2xl"
                style={{
                  background: "rgba(172,32,27,0.35)",
                  transform: "scale(1.3)",
                }}
              />

              {/* Logo card — white bg to ensure red shield is vivid on dark */}
              <div
                className="relative rounded-2xl p-4 shadow-2xl"
                style={{
                  background: "rgba(255,255,255,0.97)",
                  border: "1px solid rgba(255,255,255,0.3)",
                }}
              >
                <img
                  src="/images/techspirecollege.png"
                  alt="Techspire College crest"
                  className="w-24 h-24 object-contain"
                  draggable={false}
                />
              </div>

              {/* Light-sweep over logo */}
              {!prefersReduced && phase >= 2 && (
                <motion.div
                  className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
                  aria-hidden="true"
                >
                  <motion.div
                    className="absolute inset-y-0 w-16"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
                    }}
                    initial={{ left: "-40px" }}
                    animate={{ left: "160px" }}
                    transition={{ duration: 0.9, delay: 0.3, ease: "easeOut" }}
                  />
                </motion.div>
              )}
            </motion.div>

            {/* College name — staggered letter reveal */}
            <motion.div
              className="overflow-hidden mb-3"
              initial="hidden"
              animate={
                phase >= 3 || prefersReduced ? "visible" : "hidden"
              }
            >
              <motion.div
                className="flex flex-wrap justify-center gap-x-[2px]"
                variants={{
                  hidden: {},
                  visible: {
                    transition: {
                      staggerChildren: prefersReduced ? 0 : 0.045,
                    },
                  },
                }}
              >
                {COLLEGE_NAME.split("").map((char, i) => (
                  <motion.span
                    key={i}
                    className="inline-block font-bold text-white"
                    style={{
                      fontSize: "clamp(2rem, 5vw, 3.5rem)",
                      letterSpacing: "0.02em",
                      textShadow: "0 2px 24px rgba(172,32,27,0.4)",
                      whiteSpace: char === " " ? "pre" : undefined,
                    }}
                    variants={{
                      hidden: { opacity: 0, y: 24 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                      },
                    }}
                  >
                    {char === " " ? "\u00A0" : char}
                  </motion.span>
                ))}
              </motion.div>
            </motion.div>

            {/* Thin decorative rule */}
            <motion.div
              className="mb-4"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={
                phase >= 3 || prefersReduced
                  ? { scaleX: 1, opacity: 1 }
                  : {}
              }
              transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
              style={{ transformOrigin: "center" }}
            >
              <div
                className="h-px w-48 mx-auto"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(172,32,27,0.8), transparent)",
                }}
              />
            </motion.div>

            {/* Slogan */}
            <motion.p
              className="text-lg font-medium mb-4"
              style={{
                color: "rgba(255,255,255,0.72)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontSize: "clamp(0.8rem, 2vw, 1.05rem)",
              }}
              initial={{ opacity: 0, y: 14 }}
              animate={
                phase >= 4 || prefersReduced ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.7, ease: "easeOut" }}
            >
              Empowering Minds. Building Futures.
            </motion.p>

            {/* Description */}
            <motion.p
              className="max-w-sm text-sm leading-relaxed"
              style={{ color: "rgba(255,255,255,0.45)" }}
              initial={{ opacity: 0 }}
              animate={
                phase >= 5 || prefersReduced ? { opacity: 1 } : {}
              }
              transition={{ duration: 1.0, ease: "easeOut" }}
            >
              A premier institution dedicated to technology-driven education,
              innovation, and holistic development for tomorrow's leaders.
            </motion.p>

            {/* Loading bar */}
            {!prefersReduced && (
              <motion.div
                className="mt-10 w-40 h-px rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.1)" }}
                initial={{ opacity: 0 }}
                animate={phase >= 2 ? { opacity: 1 } : {}}
                transition={{ duration: 0.5 }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "rgba(172,32,27,0.85)" }}
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 4.4, delay: 0.8, ease: "easeInOut" }}
                />
              </motion.div>
            )}
          </div>

          {/* ── Skip button ──────────────────────────────────────────────── */}
          <motion.button
            className="absolute bottom-8 right-8 text-xs font-medium px-4 py-2 rounded-full border border-white/20 text-white/50 hover:text-white/80 hover:border-white/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.5 }}
            onClick={handleSkip}
            aria-label="Skip introduction"
          >
            Skip intro ↓
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

