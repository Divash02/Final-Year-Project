/**
 * WelcomePage.tsx
 *
 * Public-facing college welcome landing page shown at the root URL `/`
 * for unauthenticated visitors, immediately after the SplashScreen.
 *
 * Sections:
 *  - Sticky nav header
 *  - Hero
 *  - About the College
 *  - Academic Programs
 *  - Institutional Highlights
 *  - Contact & Footer
 *
 * Design system: CollegeOS tokens, navy + crimson (#AC201B) + gold accent,
 * Inter font. Uses Motion for React (already installed as `motion`).
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";

interface Props {
  /** Called when visitor clicks "Enter CollegeOS" / "Portal Login" */
  onEnterPortal: () => void;
}

/* ─────────────────── reusable section-reveal wrapper ────────────────────── */

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (prefersReduced) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [prefersReduced]);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={prefersReduced ? {} : { opacity: 0, y: 32 }}
      animate={visible || prefersReduced ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────── nav links ──────────────────────────────────────────── */

const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "Programs", href: "#programs" },
  { label: "Contact", href: "#contact" },
];

const PROGRAMS = [
  {
    code: "BScIT",
    name: "Bachelor of Science in Information Technology",
    duration: "4 Years",
    description:
      "Comprehensive training in software development, databases, networking, and modern computing principles.",
    icon: "💻",
    sem: "8 Semesters",
  },
];

const HIGHLIGHTS = [
  { icon: "🏛️", label: "Modern Facilities", value: "State-of-the-art labs" },
  { icon: "👨‍🏫", label: "Expert Faculty", value: "Industry practitioners" },
  { icon: "🌐", label: "Global Curriculum", value: "UK-aligned programs" },
  { icon: "🎓", label: "Student Success", value: "Holistic development" },
];

/* ─────────────────── component ──────────────────────────────────────────── */

export const WelcomePage: React.FC<Props> = ({ onEnterPortal }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const prefersReduced = useReducedMotion();

  /* Track scroll for sticky-nav shadow */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToSection = useCallback((href: string) => {
    setMobileOpen(false);
    const id = href.replace("#", "");
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  /* ── styles ──────────────────────────────────────────────────────────── */
  const CRIMSON = "#AC201B";
  const NAVY = "#0a0f1e";
  const NAVY_LIGHT = "#0f1829";
  const GOLD = "#c9941a";

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* ════════════════════════════════════════════════════════════════
          NAVIGATION HEADER
      ════════════════════════════════════════════════════════════════ */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: scrolled
            ? "rgba(255,255,255,0.96)"
            : "rgba(255,255,255,0.0)",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(0,0,0,0.06)" : "none",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button
              onClick={() => scrollToSection("#home")}
              className="flex items-center gap-3 focus:outline-none"
              aria-label="Techspire College – go to top"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md"
                style={{ background: "rgba(255,255,255,0.97)" }}
              >
                <img
                  src="/images/techspirecollege.png"
                  alt=""
                  className="w-7 h-7 object-contain"
                  draggable={false}
                />
              </div>
              <span
                className="font-bold text-slate-900 hidden sm:block"
                style={{ fontSize: "0.9rem", letterSpacing: "0.01em" }}
              >
                Techspire College
              </span>
            </button>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1" role="navigation" aria-label="Main navigation">
              {NAV_LINKS.map((link) => (
                <button
                  key={link.label}
                  onClick={() => scrollToSection(link.href)}
                  className="relative px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors duration-150 group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-md"
                >
                  {link.label}
                  <span
                    className="absolute bottom-1 left-4 right-4 h-px scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left rounded-full"
                    style={{ background: CRIMSON }}
                  />
                </button>
              ))}

              <button
                onClick={onEnterPortal}
                className="ml-3 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${CRIMSON} 0%, #8a1815 100%)`,
                  border: "1px solid rgba(172,32,27,0.4)",
                }}
              >
                Enter CollegeOS
              </button>
            </nav>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-white/10 transition-colors focus:outline-none"
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              <div className="w-5 h-4 flex flex-col justify-between">
                <span
                  className="block h-px bg-current rounded-full transition-all duration-200"
                  style={{ transform: mobileOpen ? "rotate(45deg) translateY(7px)" : "" }}
                />
                <span
                  className="block h-px bg-current rounded-full transition-all duration-200"
                  style={{ opacity: mobileOpen ? 0 : 1 }}
                />
                <span
                  className="block h-px bg-current rounded-full transition-all duration-200"
                  style={{ transform: mobileOpen ? "rotate(-45deg) translateY(-7px)" : "" }}
                />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              id="mobile-nav"
              role="navigation"
              aria-label="Mobile navigation"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="md:hidden overflow-hidden"
              style={{
                background: "rgba(10,15,30,0.98)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="px-6 py-4 flex flex-col gap-2">
                {NAV_LINKS.map((link) => (
                  <button
                    key={link.label}
                    onClick={() => scrollToSection(link.href)}
                    className="text-left py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    {link.label}
                  </button>
                ))}
                <button
                  onClick={onEnterPortal}
                  className="mt-2 py-2.5 rounded-lg text-sm font-semibold text-white text-center transition-all focus:outline-none"
                  style={{ background: CRIMSON }}
                >
                  Enter CollegeOS
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ════════════════════════════════════════════════════════════════
          HERO SECTION
      ════════════════════════════════════════════════════════════════ */}
      <section
        id="home"
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(160deg, #FFFFFF 0%, #F8FAFC 60%, #F1F5F9 100%)" }}
      >
        {/* Background decorative elements */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(172,32,27,0.15) 0%, transparent 65%), " +
                "radial-gradient(ellipse 50% 40% at 85% 85%, rgba(16,36,74,0.4) 0%, transparent 60%)",
            }}
          />
          <svg
            className="absolute inset-0 w-full h-full opacity-[0.04]"
            viewBox="0 0 1440 900"
            preserveAspectRatio="xMidYMid slice"
          >
            <circle cx="720" cy="450" r="380" fill="none" stroke="white" strokeWidth="1" />
            <circle cx="720" cy="450" r="260" fill="none" stroke="white" strokeWidth="0.5" />
            <line x1="0" y1="450" x2="1440" y2="450" stroke="white" strokeWidth="0.5" />
            <line x1="720" y1="0" x2="720" y2="900" stroke="white" strokeWidth="0.5" />
          </svg>
        </div>

        {/* Hero content */}
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center pt-20 pb-16">
          {/* Logo badge */}
          <motion.div
            className="flex justify-center mb-8"
            initial={prefersReduced ? {} : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="relative group"
              style={{ cursor: "default" }}
            >
              <div
                className="absolute inset-0 rounded-3xl blur-xl transition-all duration-500 group-hover:blur-2xl"
                style={{ background: `rgba(172,32,27,0.3)`, transform: "scale(1.2)" }}
              />
              <div
                className="relative rounded-3xl p-5 shadow-2xl"
                style={{
                  background: "rgba(255,255,255,0.97)",
                  border: "2px solid rgba(255,255,255,0.2)",
                  transform: "perspective(400px)",
                }}
              >
                <img
                  src="/images/techspirecollege.png"
                  alt="Techspire College crest"
                  className="w-20 h-20 object-contain transition-transform duration-500 group-hover:scale-105"
                  draggable={false}
                />
              </div>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1
              className="font-bold text-slate-900 mb-4"
              style={{
                fontSize: "clamp(2.4rem, 6vw, 4.5rem)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                textShadow: "0 4px 32px rgba(0,0,0,0.4)",
              }}
            >
              Techspire
              <span style={{ color: CRIMSON }}> College</span>
            </h1>
          </motion.div>

          {/* Slogan */}
          <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <p
              className="font-semibold mb-5"
              style={{
                fontSize: "clamp(1rem, 2.5vw, 1.4rem)",
                color: GOLD,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Empowering Minds. Building Futures.
            </p>
          </motion.div>

          {/* Description */}
          <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <p
              className="mx-auto mb-10 leading-relaxed"
              style={{
                maxWidth: 540,
                color: "#000000",
                fontSize: "clamp(0.9rem, 2vw, 1.05rem)",
              }}
            >
              A premier institution dedicated to technology-driven education,
              innovation, and holistic development. Where every student is
              prepared to lead in a rapidly changing world.
            </p>
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={prefersReduced ? {} : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.52, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Primary */}
            <button
              onClick={onEnterPortal}
              className="relative group px-8 py-3.5 rounded-xl font-semibold text-white text-sm transition-all duration-200 hover:scale-105 active:scale-95 shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/40"
              style={{
                background: `linear-gradient(135deg, ${CRIMSON} 0%, #8a1815 100%)`,
                minWidth: 180,
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                Enter CollegeOS
                <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </span>
              {/* Shimmer */}
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none overflow-hidden"
              >
                <div
                  className="absolute inset-y-0 w-20 -left-10 group-hover:left-full transition-all duration-700"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }}
                />
              </div>
            </button>

            {/* Secondary */}
            <button
              onClick={() => scrollToSection("#about")}
              className="px-8 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/20"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#0f172a",
                minWidth: 180,
              }}
            >
              Explore College ↓
            </button>
          </motion.div>

          {/* Scroll indicator */}
          {!prefersReduced && (
            <motion.div
              className="mt-16 flex flex-col items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ delay: 1.2, duration: 0.6 }}
            >
              <span className="text-xs text-slate-400 uppercase tracking-widest">Scroll</span>
              <motion.div
                className="w-px h-10 rounded-full"
                style={{ background: "linear-gradient(to bottom, #64748b, transparent)" }}
                animate={{ scaleY: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          ABOUT SECTION
      ════════════════════════════════════════════════════════════════ */}
      <section id="about" className="py-24 px-6" style={{ background: "#ffffff" }}>
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <span
              className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
              style={{ background: "#fee2e2", color: CRIMSON }}
            >
              About Us
            </span>
            <h2
              className="font-bold mb-4"
              style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "#0f172a", letterSpacing: "-0.02em" }}
            >
              A College Built for the Future
            </h2>
            <p className="max-w-2xl mx-auto text-base leading-relaxed" style={{ color: "#64748b" }}>
              Techspire College is an institution committed to providing
              world-class technology education. Our UK-aligned curriculum,
              experienced faculty, and modern facilities prepare students for
              the demands of the global digital economy.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Our Mission",
                body:
                  "To deliver technology-focused education that empowers graduates with practical skills, critical thinking, and professional values.",
                icon: "🎯",
              },
              {
                title: "Our Vision",
                body:
                  "To be a leading institution recognized for excellence in computing education, research, and industry collaboration.",
                icon: "🌟",
              },
              {
                title: "Our Values",
                body:
                  "Integrity, innovation, inclusivity, and excellence — in every programme, every classroom, and every interaction.",
                icon: "⚖️",
              },
            ].map((card, i) => (
              <Reveal key={card.title} delay={i * 0.1}>
                <div
                  className="p-7 rounded-2xl h-full border transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
                  style={{
                    background: "#f8fafc",
                    borderColor: "#e2e8f0",
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-5"
                    style={{ background: "#fee2e2" }}
                  >
                    {card.icon}
                  </div>
                  <h3
                    className="font-semibold mb-3 text-base"
                    style={{ color: "#0f172a" }}
                  >
                    {card.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                    {card.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          HIGHLIGHTS STRIP
      ════════════════════════════════════════════════════════════════ */}
      <section
        className="py-16 px-6"
        style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_LIGHT} 100%)`,
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {HIGHLIGHTS.map((h, i) => (
              <Reveal key={h.label} delay={i * 0.08}>
                <div className="text-center">
                  <div
                    className="text-3xl mb-3 mx-auto w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: "rgba(172,32,27,0.2)" }}
                  >
                    {h.icon}
                  </div>
                  <p className="font-bold text-slate-900 text-sm mb-1">{h.label}</p>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {h.value}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          ACADEMIC PROGRAMS
      ════════════════════════════════════════════════════════════════ */}
      <section id="programs" className="py-24 px-6" style={{ background: "#f1f5f9" }}>
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <span
              className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
              style={{ background: "#fee2e2", color: CRIMSON }}
            >
              Academic Programs
            </span>
            <h2
              className="font-bold mb-4"
              style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "#0f172a", letterSpacing: "-0.02em" }}
            >
              Programmes of Study
            </h2>
            <p className="max-w-xl mx-auto text-sm leading-relaxed" style={{ color: "#64748b" }}>
              Rigorous, industry-relevant programmes designed to build technical
              expertise and professional confidence.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-7">
            {PROGRAMS.map((prog, i) => (
              <Reveal key={prog.code} delay={i * 0.1}>
                <div
                  className="rounded-2xl overflow-hidden border flex flex-col h-full transition-all duration-200 hover:shadow-xl hover:-translate-y-1.5 group"
                  style={{ background: "#ffffff", borderColor: "#e2e8f0" }}
                >
                  <div
                    className="h-2 w-full"
                    style={{ background: `linear-gradient(90deg, ${CRIMSON}, #8a1815)` }}
                  />
                  <div className="p-7 flex flex-col flex-1">
                    <div className="flex items-start justify-between mb-5">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                        style={{ background: "#fee2e2" }}
                      >
                        {prog.icon}
                      </div>
                      <span
                        className="text-xs font-bold px-3 py-1 rounded-full"
                        style={{ background: "#f1f5f9", color: "#475569" }}
                      >
                        {prog.duration}
                      </span>
                    </div>
                    <span
                      className="text-xs font-bold uppercase tracking-widest mb-2"
                      style={{ color: CRIMSON }}
                    >
                      {prog.code}
                    </span>
                    <h3
                      className="font-bold text-base mb-3"
                      style={{ color: "#0f172a" }}
                    >
                      {prog.name}
                    </h3>
                    <p className="text-sm leading-relaxed flex-1 mb-5" style={{ color: "#64748b" }}>
                      {prog.description}
                    </p>
                    <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: "#e2e8f0" }}>
                      <span className="text-xs" style={{ color: "#94a3b8" }}>
                        {prog.sem}
                      </span>
                      <button
                        onClick={onEnterPortal}
                        className="text-xs font-semibold transition-colors duration-150 flex items-center gap-1 hover:gap-2"
                        style={{ color: CRIMSON }}
                      >
                        Enter Portal →
                      </button>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          PORTAL CTA BANNER
      ════════════════════════════════════════════════════════════════ */}
      <section
        className="py-20 px-6 relative overflow-hidden"
        style={{ background: "#FFFFFF" }}
      >
        <div className="absolute inset-0 pointer-events-none opacity-10" aria-hidden="true">
          <svg viewBox="0 0 1200 400" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
            <circle cx="600" cy="200" r="300" fill="none" stroke="white" strokeWidth="1" />
            <circle cx="600" cy="200" r="200" fill="none" stroke="white" strokeWidth="0.5" />
          </svg>
        </div>
        <Reveal className="relative z-10 max-w-3xl mx-auto text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl"
            style={{ background: "rgba(255,255,255,0.97)" }}
          >
            <img
              src="/images/techspirecollege.png"
              alt=""
              className="w-12 h-12 object-contain"
              draggable={false}
            />
          </div>
          <h2
            className="font-bold text-slate-900 mb-4"
            style={{ fontSize: "clamp(1.6rem, 4vw, 2.6rem)", letterSpacing: "-0.02em" }}
          >
            Ready to access your workspace?
          </h2>
          <p className="mb-8 text-sm leading-relaxed" style={{ color: "#0f172a" }}>
            Students, faculty, and staff can log in to CollegeOS to access
            courses, assignments, grades, timetables, and all institutional services.
          </p>
          <button
            onClick={onEnterPortal}
            className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-105 active:scale-95 shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
            style={{ background: "#AF231B", color: "#FFFFFF" }}
          >
            Enter CollegeOS Portal
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </Reveal>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          CONTACT SECTION
      ════════════════════════════════════════════════════════════════ */}
      <section id="contact" className="py-24 px-6" style={{ background: "#ffffff" }}>
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <span
              className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
              style={{ background: "#fee2e2", color: CRIMSON }}
            >
              Contact
            </span>
            <h2
              className="font-bold mb-4"
              style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "#0f172a", letterSpacing: "-0.02em" }}
            >
              Get in Touch
            </h2>
            <p className="max-w-xl mx-auto text-sm" style={{ color: "#64748b" }}>
              Reach out to the Techspire College administration for admissions,
              academic, or general enquiries.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-7 max-w-4xl mx-auto">
            {[
              {
                icon: "🏛️",
                title: "Campus",
                detail: "Techspire College, Nepal",
              },
              {
                icon: "📧",
                title: "Portal Access",
                detail: "Use the Enter CollegeOS button to log in",
              },
              {
                icon: "🕐",
                title: "Office Hours",
                detail: "Sunday – Friday, 9:00 AM – 5:00 PM",
              },
            ].map((item, i) => (
              <Reveal key={item.title} delay={i * 0.1}>
                <div
                  className="p-6 rounded-2xl text-center border"
                  style={{ background: "#f8fafc", borderColor: "#e2e8f0" }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl mx-auto mb-4"
                    style={{ background: "#fee2e2" }}
                  >
                    {item.icon}
                  </div>
                  <h3 className="font-semibold text-sm mb-1" style={{ color: "#0f172a" }}>
                    {item.title}
                  </h3>
                  <p className="text-sm" style={{ color: "#64748b" }}>
                    {item.detail}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════════════ */}
      <footer
        style={{ background: "#F8FAFC", borderTop: "1px solid rgba(0,0,0,0.06)" }}
        className="py-10 px-6"
      >
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shadow"
              style={{ background: "rgba(255,255,255,0.97)" }}
            >
              <img
                src="/images/techspirecollege.png"
                alt=""
                className="w-7 h-7 object-contain"
                draggable={false}
              />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Techspire College</p>
              <p className="text-xs" style={{ color: "#64748b" }}>
                Empowering Minds. Building Futures.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => scrollToSection(link.href)}
                className="text-xs transition-colors hover:text-slate-900 focus:outline-none"
                style={{ color: "#64748b" }}
              >
                {link.label}
              </button>
            ))}
          </div>

          <button
            onClick={onEnterPortal}
            className="px-5 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105 active:scale-95 focus:outline-none"
            style={{ background: CRIMSON }}
          >
            Enter CollegeOS
          </button>
        </div>

        <div
          className="mt-8 pt-6 text-center text-xs"
          style={{
            borderTop: "1px solid rgba(0,0,0,0.06)",
            color: "#64748b",
          }}
        >
          © {new Date().getFullYear()} Techspire College. Powered by CollegeOS.
        </div>
      </footer>
    </div>
  );
};

