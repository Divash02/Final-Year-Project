import React, { useState, useEffect } from "react";

interface RealisticCampusFallbackProps {
  transitioning?: boolean;
  onTransitionComplete?: () => void;
  extraControls?: React.ReactNode;
}

export const RealisticCampusFallback: React.FC<RealisticCampusFallbackProps> = ({
  transitioning = false,
  onTransitionComplete,
  extraControls,
}) => {
  const [timeMode, setTimeMode] = useState<"day" | "sunset" | "night">("day");
  const [shuttle1Offset, setShuttle1Offset] = useState(0);
  const [shuttle2Offset, setShuttle2Offset] = useState(180);
  const [car1Offset, setCar1Offset] = useState(45);
  const [car2Offset, setCar2Offset] = useState(225);
  const [waterRipple, setWaterRipple] = useState(0);
  const [pedestrianCycle, setPedestrianCycle] = useState(0);
  const [cloudOffset, setCloudOffset] = useState(0);
  const [flagWave, setFlagWave] = useState(0);
  const [hoveredBuilding, setHoveredBuilding] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("");

  // Animation loop running continuously at 60 FPS
  useEffect(() => {
    let animId: number;
    let start = performance.now();

    const loop = (time: number) => {
      const elapsed = (time - start) / 1000;
      setShuttle1Offset((elapsed * 16) % 360);
      setShuttle2Offset(((elapsed * 16) + 180) % 360);
      setCar1Offset((elapsed * 25) % 360);
      setCar2Offset(((elapsed * 22) + 180) % 360);
      setWaterRipple((elapsed * 3) % 1);
      setPedestrianCycle((elapsed * 5) % (Math.PI * 2));
      setCloudOffset((elapsed * 6) % 1200);
      setFlagWave(Math.sin(elapsed * 4) * 5);
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Live campus clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isNight = timeMode === "night";
  const isSunset = timeMode === "sunset";

  // Resolve the login transition so the app shell can unmount the login view.
  // The animated campus uses a CSS transition (duration-1000), so we fire the
  // callback after that window to match the visual completion.
  useEffect(() => {
    if (!transitioning) return;
    const timer = window.setTimeout(() => {
      onTransitionComplete?.();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [transitioning, onTransitionComplete]);

  // Palette according to time mode
  const skyBg = isNight
    ? "from-slate-950 via-slate-900 to-indigo-950"
    : isSunset
    ? "from-amber-200 via-orange-400 to-indigo-950"
    : "from-sky-200 via-emerald-100/50 to-slate-200";

  const groundColor = isNight ? "#111c24" : isSunset ? "#2c3b2d" : "#2f5c40";
  const roadColor = isNight ? "#090d12" : isSunset ? "#161b22" : "#1f242c";
  const windowGlow = isNight ? "#fef08a" : isSunset ? "#fed7aa" : "#e0f2fe";
  const windowOpacity = isNight ? 0.95 : isSunset ? 0.8 : 0.55;

  // Function to calculate parametric position along the diamond ring road
  const getRoadPosition = (deg: number) => {
    const t = (deg % 360) / 360;
    let x = 500;
    let y = 160;
    let angle = 0;

    if (t < 0.25) {
      const p = t / 0.25;
      x = 500 + p * (890 - 500);
      y = 160 + p * (380 - 160);
      angle = 30;
    } else if (t < 0.5) {
      const p = (t - 0.25) / 0.25;
      x = 890 - p * (890 - 500);
      y = 380 + p * (620 - 380);
      angle = 150;
    } else if (t < 0.75) {
      const p = (t - 0.5) / 0.25;
      x = 500 - p * (500 - 110);
      y = 620 - p * (620 - 380);
      angle = 210;
    } else {
      const p = (t - 0.75) / 0.25;
      x = 110 + p * (500 - 110);
      y = 380 - p * (380 - 160);
      angle = 330;
    }

    return { x, y, angle };
  };

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-gradient-to-br ${skyBg} transition-colors duration-1000 select-none`}
    >
      {/* Simulation HUD Top Bar */}
      <div className="absolute top-6 left-6 right-6 z-20 flex items-center justify-between text-xs pointer-events-auto">
        <div className="flex items-center gap-2.5 rounded-full bg-slate-900/85 px-4 py-1.5 text-white shadow-xl backdrop-blur-md border border-white/10">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="font-bold tracking-wider uppercase text-[11px] text-emerald-400">
            3D Campus Digital Twin
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300 font-mono text-[10px]">
            TechSpire Central
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-300 font-mono text-[10px] font-semibold">
            {currentTime}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Time of Day Switcher */}
          <div className="flex items-center gap-1 rounded-full bg-slate-900/85 p-1 text-white shadow-xl backdrop-blur-md border border-white/10">
            <button
              type="button"
              onClick={() => setTimeMode("day")}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                timeMode === "day"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setTimeMode("sunset")}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                timeMode === "sunset"
                  ? "bg-amber-600 text-white shadow"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Sunset
            </button>
            <button
              type="button"
              onClick={() => setTimeMode("night")}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                timeMode === "night"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Night
            </button>
          </div>

          {extraControls}
        </div>
      </div>

      {/* Main Isometric Campus SVG Canvas */}
      <svg
        viewBox="0 0 1000 700"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000"
        style={{
          transform: transitioning ? "scale(1.15)" : "scale(1)",
        }}
      >
        <defs>
          <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor={isSunset ? "#ff5500" : "#ffffff"}
              stopOpacity={isNight ? 0 : 0.85}
            />
            <stop
              offset="100%"
              stopColor={isSunset ? "#9333ea" : "#38bdf8"}
              stopOpacity="0"
            />
          </radialGradient>

          {/* Building Facade Gradients */}
          <linearGradient id="facadeFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isNight ? "#1e293b" : "#475569"} />
            <stop offset="100%" stopColor={isNight ? "#0f172a" : "#334155"} />
          </linearGradient>

          <linearGradient id="facadeSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isNight ? "#0f172a" : "#334155"} />
            <stop offset="100%" stopColor={isNight ? "#020617" : "#1e293b"} />
          </linearGradient>

          <linearGradient id="facadeRoof" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={isNight ? "#334155" : "#64748b"} />
            <stop offset="100%" stopColor={isNight ? "#1e293b" : "#475569"} />
          </linearGradient>

          {/* Admin Tower Gold Roof */}
          <linearGradient id="adminRoof" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={isNight ? "#b45309" : "#f59e0b"} />
            <stop offset="100%" stopColor={isNight ? "#78350f" : "#b45309"} />
          </linearGradient>

          {/* Glass Windows Gradient */}
          <linearGradient id="glassReflection" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.8" />
          </linearGradient>

          {/* Shadow Filter */}
          <filter id="campusShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="8" />
            <feOffset dx="10" dy="16" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.35" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Sky: Celestial Body & Stars */}
        {!isNight && (
          <circle
            cx={isSunset ? "760" : "820"}
            cy={isSunset ? "210" : "110"}
            r={isSunset ? "120" : "80"}
            fill="url(#sunGlow)"
          />
        )}
        {isNight && (
          <>
            <g transform="translate(820, 90)">
              <circle cx="0" cy="0" r="32" fill="#fef08a" opacity="0.9" />
              <circle cx="-12" cy="-6" r="28" fill="#020617" />
            </g>
            {/* Stars */}
            {[
              [120, 50], [240, 70], [380, 40], [620, 80], [710, 45], [920, 60],
              [180, 110], [540, 95], [890, 130],
            ].map(([sx, sy], i) => (
              <circle
                key={i}
                cx={sx}
                cy={sy}
                r="1.5"
                fill="#ffffff"
                opacity={0.4 + (i % 3) * 0.25}
              />
            ))}
          </>
        )}

        {/* Drifting Clouds */}
        {!isNight && (
          <g opacity={isSunset ? 0.35 : 0.65}>
            <g transform={`translate(${((cloudOffset + 100) % 1200) - 200}, 80)`}>
              <ellipse cx="60" cy="20" rx="60" ry="16" fill="#ffffff" />
              <ellipse cx="90" cy="12" rx="35" ry="18" fill="#ffffff" />
              <ellipse cx="35" cy="16" rx="28" ry="14" fill="#ffffff" />
            </g>
            <g transform={`translate(${((cloudOffset * 0.7 + 600) % 1200) - 200}, 130)`}>
              <ellipse cx="80" cy="25" rx="75" ry="18" fill="#ffffff" />
              <ellipse cx="120" cy="18" rx="40" ry="20" fill="#ffffff" />
              <ellipse cx="50" cy="20" rx="32" ry="15" fill="#ffffff" />
            </g>
          </g>
        )}

        {/* Isometric Campus Ground Plane (Polygon) */}
        <polygon
          points="500,120 950,380 500,660 50,380"
          fill={groundColor}
          filter="url(#campusShadow)"
          className="transition-colors duration-700"
        />

        {/* Inner Landscaped Plaza */}
        <polygon
          points="500,210 820,380 500,560 180,380"
          fill={isNight ? "#15242e" : isSunset ? "#344534" : "#3b7351"}
          className="transition-colors duration-700"
        />

        {/* Sports Field Area (Far Right Oval) */}
        <ellipse
          cx="780"
          cy="260"
          rx="50"
          ry="25"
          fill={isNight ? "#0d3322" : "#15803d"}
          stroke={isNight ? "#166534" : "#ffffff"}
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />

        {/* Ring Road Loop */}
        <path
          d="M 500 160 L 890 380 L 500 620 L 110 380 Z"
          fill="none"
          stroke={roadColor}
          strokeWidth="32"
          strokeLinejoin="round"
          className="transition-colors duration-700"
        />
        {/* Road Curb Borders */}
        <path
          d="M 500 144 L 906 380 L 500 636 L 94 380 Z"
          fill="none"
          stroke={isNight ? "#1e293b" : "#94a3b8"}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M 500 176 L 874 380 L 500 604 L 126 380 Z"
          fill="none"
          stroke={isNight ? "#1e293b" : "#94a3b8"}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Road Center Lane Dashes */}
        <path
          d="M 500 160 L 890 380 L 500 620 L 110 380 Z"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeDasharray="16 14"
          strokeLinejoin="round"
          opacity={isNight ? 0.45 : 0.75}
        />

        {/* Pedestrian Crosswalks (Zebra Stripes) */}
        {[
          { x: 305, y: 270, angle: 30 },
          { x: 695, y: 270, angle: -30 },
          { x: 695, y: 490, angle: 30 },
          { x: 305, y: 490, angle: -30 },
        ].map((cw, i) => (
          <g key={i} transform={`translate(${cw.x}, ${cw.y}) rotate(${cw.angle})`}>
            {[-8, -4, 0, 4, 8].map((offset) => (
              <line
                key={offset}
                x1={offset}
                y1="-14"
                x2={offset}
                y2="14"
                stroke="#ffffff"
                strokeWidth="2.5"
                opacity="0.85"
              />
            ))}
          </g>
        ))}

        {/* Diagonal Cross Walkways */}
        <line
          x1="320"
          y1="280"
          x2="680"
          y2="480"
          stroke={isNight ? "#1e293b" : "#cbd5e1"}
          strokeWidth="12"
          opacity="0.85"
        />
        <line
          x1="680"
          y1="280"
          x2="320"
          y2="480"
          stroke={isNight ? "#1e293b" : "#cbd5e1"}
          strokeWidth="12"
          opacity="0.85"
        />

        {/* ======================================================== */}
        {/* ANIMATED WATER FOUNTAIN (Central Quad)                  */}
        {/* ======================================================== */}
        <g transform="translate(500, 380)">
          {/* Outer Pool Wall */}
          <ellipse cx="0" cy="0" rx="48" ry="26" fill="#64748b" />
          <ellipse cx="0" cy="-2" rx="46" ry="24" fill={isNight ? "#0369a1" : "#0284c7"} />
          {/* Animated Water Ripples */}
          <ellipse
            cx="0"
            cy="-2"
            rx={20 + waterRipple * 22}
            ry={10 + waterRipple * 11}
            fill="none"
            stroke="#bae6fd"
            strokeWidth="1.5"
            opacity={1 - waterRipple}
          />
          <ellipse
            cx="0"
            cy="-2"
            rx={10 + waterRipple * 18}
            ry={5 + waterRipple * 9}
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.5"
            opacity={1 - waterRipple}
          />
          {/* Central Fountain Tier */}
          <ellipse cx="0" cy="-6" rx="14" ry="8" fill="#cbd5e1" />
          <ellipse cx="0" cy="-10" rx="8" ry="5" fill="#f8fafc" />
          {/* Water Spout Spray */}
          <ellipse
            cx="0"
            cy="-14"
            rx="3"
            ry="6"
            fill="#e0f2fe"
            opacity="0.9"
            className="animate-pulse"
          />
        </g>

        {/* ======================================================== */}
        {/* BUILDINGS (Rendered with 2.5D Isometric Prisms)         */}
        {/* ======================================================== */}

        {/* 1. CENTRAL ADMINISTRATION TOWER (Center-Back) */}
        <g
          transform="translate(430, 200)"
          className="cursor-pointer transition-all duration-300"
          onMouseEnter={() => setHoveredBuilding("Admin")}
          onMouseLeave={() => setHoveredBuilding(null)}
        >
          {/* Base Prism */}
          <polygon
            points="70,0 140,40 140,140 70,180 0,140 0,40"
            fill="url(#facadeSide)"
          />
          {/* Front Face */}
          <polygon
            points="70,180 140,140 140,40 70,80"
            fill="url(#facadeFront)"
          />
          {/* Left Face */}
          <polygon
            points="0,140 70,180 70,80 0,40"
            fill="url(#facadeSide)"
          />
          {/* Gold Roof */}
          <polygon
            points="70,0 140,40 70,80 0,40"
            fill="url(#adminRoof)"
          />
          {/* Tower Spire */}
          <polygon points="70,-45 74,40 66,40" fill="#f59e0b" />
          <circle cx="70" cy="-45" r="3.5" fill="#ef4444" className="animate-pulse" />

          {/* Clock Face on Admin Tower */}
          <circle cx="70" cy="55" r="9" fill="#ffffff" stroke="#d97706" strokeWidth="1.5" />
          <line x1="70" y1="55" x2="70" y2="49" stroke="#1e293b" strokeWidth="1.2" />
          <line x1="70" y1="55" x2="74" y2="55" stroke="#1e293b" strokeWidth="1.2" />

          {/* Flagpole & Waving Flag in front of Admin */}
          <line x1="16" y1="170" x2="16" y2="120" stroke="#94a3b8" strokeWidth="1.5" />
          <polygon
            points={`16,122 36,${126 + flagWave} 16,134`}
            fill="#059669"
            stroke="#047857"
            strokeWidth="0.5"
          />

          {/* Windows Grid (Lit) */}
          {[100, 120, 140, 160].map((y, idx) => (
            <g key={idx}>
              <polygon
                points={`20,${y - 45} 35,${y - 36} 35,${y - 24} 20,${y - 33}`}
                fill={windowGlow}
                opacity={windowOpacity}
              />
              <polygon
                points={`45,${y - 30} 60,${y - 21} 60,${y - 9} 45,${y - 18}`}
                fill={windowGlow}
                opacity={windowOpacity}
              />
              <polygon
                points={`80,${y - 18} 95,${y - 27} 95,${y - 39} 80,${y - 30}`}
                fill={windowGlow}
                opacity={windowOpacity}
              />
              <polygon
                points={`105,${y - 33} 120,${y - 42} 120,${y - 54} 105,${y - 45}`}
                fill={windowGlow}
                opacity={windowOpacity}
              />
            </g>
          ))}
          {/* Building Label */}
          <text
            x="70"
            y="200"
            textAnchor="middle"
            fill="#f8fafc"
            fontSize="11"
            fontWeight="bold"
            letterSpacing="1"
            className="drop-shadow-md"
          >
            ADMINISTRATION
          </text>
        </g>

        {/* 2. ACADEMIC & ENGINEERING QUAD (Left-Front) */}
        <g
          transform="translate(190, 310)"
          className="cursor-pointer"
          onMouseEnter={() => setHoveredBuilding("Academic")}
          onMouseLeave={() => setHoveredBuilding(null)}
        >
          {/* Front Face */}
          <polygon
            points="90,160 180,110 180,30 90,80"
            fill="url(#facadeFront)"
          />
          {/* Left Face */}
          <polygon
            points="0,110 90,160 90,80 0,30"
            fill="url(#facadeSide)"
          />
          {/* Roof with Solar Panel Array */}
          <polygon
            points="90,0 180,30 90,80 0,30"
            fill="url(#facadeRoof)"
          />
          {/* Solar Panels on Roof */}
          {[18, 32, 46].map((sy, i) => (
            <polygon
              key={i}
              points={`40,${sy + 10} 80,${sy + 26} 120,${sy + 10} 80,${sy - 6}`}
              fill="#1e3a8a"
              stroke="#3b82f6"
              strokeWidth="0.8"
              opacity="0.85"
            />
          ))}

          {/* Windows Matrix */}
          {[80, 105, 130].map((y, idx) => (
            <g key={idx}>
              <polygon
                points={`20,${y - 30} 40,${y - 18} 40,${y - 6} 20,${y - 18}`}
                fill={windowGlow}
                opacity={windowOpacity}
              />
              <polygon
                points={`55,${y - 10} 75,${y + 2} 75,${y + 14} 55,${y + 2}`}
                fill={windowGlow}
                opacity={windowOpacity}
              />
              <polygon
                points={`105,${y + 2} 125,${y - 10} 125,${y - 22} 105,${y - 10}`}
                fill={windowGlow}
                opacity={windowOpacity}
              />
              <polygon
                points={`140,${y - 18} 160,${y - 30} 160,${y - 42} 140,${y - 30}`}
                fill={windowGlow}
                opacity={windowOpacity}
              />
            </g>
          ))}
          <text
            x="90"
            y="180"
            textAnchor="middle"
            fill="#f8fafc"
            fontSize="11"
            fontWeight="bold"
            letterSpacing="1"
            className="drop-shadow-md"
          >
            ACADEMIC QUAD
          </text>
        </g>

        {/* 3. CENTRAL LIBRARY & INNOVATION HUB (Right-Front) */}
        <g
          transform="translate(640, 320)"
          className="cursor-pointer"
          onMouseEnter={() => setHoveredBuilding("Library")}
          onMouseLeave={() => setHoveredBuilding(null)}
        >
          {/* Front Face */}
          <polygon
            points="90,170 180,120 180,40 90,90"
            fill="url(#facadeFront)"
          />
          {/* Left Face */}
          <polygon
            points="0,120 90,170 90,90 0,40"
            fill="url(#facadeSide)"
          />
          {/* Roof Dome Accent */}
          <polygon
            points="90,10 180,40 90,90 0,40"
            fill="url(#facadeRoof)"
          />
          <ellipse
            cx="90"
            cy="50"
            rx="30"
            ry="16"
            fill={isNight ? "#0284c7" : "#38bdf8"}
            opacity="0.8"
          />

          {/* Library Glass Curtain Wall */}
          <polygon
            points="25,95 70,120 70,150 25,125"
            fill="url(#glassReflection)"
            opacity={isNight ? 0.95 : 0.75}
          />
          <polygon
            points="110,120 155,95 155,125 110,150"
            fill="url(#glassReflection)"
            opacity={isNight ? 0.95 : 0.75}
          />
          <text
            x="90"
            y="190"
            textAnchor="middle"
            fill="#f8fafc"
            fontSize="11"
            fontWeight="bold"
            letterSpacing="1"
            className="drop-shadow-md"
          >
            CENTRAL LIBRARY
          </text>
        </g>

        {/* 4. STUDENT RECREATION & SPORTS COMPLEX (Far Right) */}
        <g
          transform="translate(730, 220)"
          className="cursor-pointer"
          onMouseEnter={() => setHoveredBuilding("Sports")}
          onMouseLeave={() => setHoveredBuilding(null)}
        >
          <polygon
            points="60,110 120,75 120,25 60,60"
            fill="url(#facadeFront)"
          />
          <polygon
            points="0,75 60,110 60,60 0,25"
            fill="url(#facadeSide)"
          />
          <polygon
            points="60,5 120,25 60,60 0,25"
            fill={isNight ? "#1e3a5f" : "#0284c7"}
          />
          <text
            x="60"
            y="125"
            textAnchor="middle"
            fill="#f8fafc"
            fontSize="10"
            fontWeight="bold"
          >
            SPORTS DOME
          </text>
        </g>

        {/* 5. RESEARCH LABS & INCUBATOR (Far Left) */}
        <g
          transform="translate(130, 220)"
          className="cursor-pointer"
          onMouseEnter={() => setHoveredBuilding("Research")}
          onMouseLeave={() => setHoveredBuilding(null)}
        >
          <polygon
            points="60,110 120,75 120,25 60,60"
            fill="url(#facadeFront)"
          />
          <polygon
            points="0,75 60,110 60,60 0,25"
            fill="url(#facadeSide)"
          />
          <polygon
            points="60,5 120,25 60,60 0,25"
            fill="url(#facadeRoof)"
          />
          {/* Satellite Dish on Roof */}
          <ellipse cx="60" cy="18" rx="10" ry="6" fill="#94a3b8" />
          <line x1="60" y1="18" x2="60" y2="8" stroke="#cbd5e1" strokeWidth="1.5" />
          <text
            x="60"
            y="125"
            textAnchor="middle"
            fill="#f8fafc"
            fontSize="10"
            fontWeight="bold"
          >
            RESEARCH LABS
          </text>
        </g>

        {/* Campus Trees & Greenery Silhouettes */}
        {[
          [350, 240], [380, 260], [600, 240], [630, 260],
          [280, 420], [310, 440], [690, 420], [720, 440],
          [480, 520], [520, 520], [420, 460], [580, 460],
          [230, 200], [250, 220], [790, 200], [810, 220],
        ].map(([tx, ty], i) => (
          <g key={i} transform={`translate(${tx}, ${ty})`}>
            <ellipse cx="0" cy="4" rx="10" ry="5" fill="#000000" opacity="0.25" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="#45271d" strokeWidth="3" />
            <circle
              cx="0"
              cy="-6"
              r="15"
              fill={isNight ? "#064e3b" : isSunset ? "#14532d" : "#15803d"}
            />
            <circle
              cx="4"
              cy="-10"
              r="11"
              fill={isNight ? "#047857" : isSunset ? "#166534" : "#22c55e"}
            />
          </g>
        ))}

        {/* ======================================================== */}
        {/* MOVING VEHICLES ON RING ROAD                            */}
        {/* ======================================================== */}

        {/* VEHICLE 1: Campus Shuttle 1 */}
        {(() => {
          const { x, y, angle } = getRoadPosition(shuttle1Offset);
          return (
            <g transform={`translate(${x}, ${y}) rotate(${angle})`}>
              <ellipse cx="0" cy="8" rx="18" ry="8" fill="#000000" opacity="0.35" />
              <rect
                x="-16"
                y="-10"
                width="32"
                height="18"
                rx="4"
                fill="#0d9488"
                stroke="#14b8a6"
                strokeWidth="1.5"
              />
              <rect x="-12" y="-8" width="24" height="6" rx="2" fill="#e0f2fe" />
              {/* Wheels */}
              <circle cx="-10" cy="8" r="3" fill="#0f172a" />
              <circle cx="10" cy="8" r="3" fill="#0f172a" />
              {/* Headlights */}
              {isNight && (
                <>
                  <circle cx="14" cy="-2" r="3" fill="#fef08a" />
                  <polygon points="14,-2 46,-14 46,10" fill="#fef08a" opacity="0.25" />
                </>
              )}
            </g>
          );
        })()}

        {/* VEHICLE 2: Campus Shuttle 2 (Opposite Ring Side) */}
        {(() => {
          const { x, y, angle } = getRoadPosition(shuttle2Offset);
          return (
            <g transform={`translate(${x}, ${y}) rotate(${angle})`}>
              <ellipse cx="0" cy="8" rx="18" ry="8" fill="#000000" opacity="0.35" />
              <rect
                x="-16"
                y="-10"
                width="32"
                height="18"
                rx="4"
                fill="#0284c7"
                stroke="#38bdf8"
                strokeWidth="1.5"
              />
              <rect x="-12" y="-8" width="24" height="6" rx="2" fill="#e0f2fe" />
              <circle cx="-10" cy="8" r="3" fill="#0f172a" />
              <circle cx="10" cy="8" r="3" fill="#0f172a" />
              {isNight && (
                <>
                  <circle cx="14" cy="-2" r="3" fill="#fef08a" />
                  <polygon points="14,-2 46,-14 46,10" fill="#fef08a" opacity="0.25" />
                </>
              )}
            </g>
          );
        })()}

        {/* VEHICLE 3: Red Car */}
        {(() => {
          const { x, y, angle } = getRoadPosition(car1Offset);
          return (
            <g transform={`translate(${x}, ${y}) rotate(${angle})`}>
              <ellipse cx="0" cy="6" rx="13" ry="6" fill="#000000" opacity="0.3" />
              <rect
                x="-11"
                y="-7"
                width="22"
                height="13"
                rx="3.5"
                fill="#e11d48"
                stroke="#f43f5e"
                strokeWidth="1"
              />
              <rect x="-8" y="-5" width="15" height="4.5" rx="1.5" fill="#bae6fd" />
              <circle cx="-7" cy="6" r="2.5" fill="#0f172a" />
              <circle cx="7" cy="6" r="2.5" fill="#0f172a" />
              {isNight && (
                <>
                  <circle cx="9" cy="-1" r="2" fill="#fef08a" />
                  <polygon points="9,-1 35,-10 35,8" fill="#fef08a" opacity="0.2" />
                </>
              )}
            </g>
          );
        })()}

        {/* VEHICLE 4: Electric Cart */}
        {(() => {
          const { x, y, angle } = getRoadPosition(car2Offset);
          return (
            <g transform={`translate(${x}, ${y}) rotate(${angle})`}>
              <ellipse cx="0" cy="6" rx="11" ry="5" fill="#000000" opacity="0.3" />
              <rect
                x="-9"
                y="-6"
                width="18"
                height="11"
                rx="3"
                fill="#10b981"
                stroke="#34d399"
                strokeWidth="1"
              />
              <rect x="-6" y="-4" width="12" height="4" rx="1.5" fill="#ffffff" />
            </g>
          );
        })()}

        {/* ======================================================== */}
        {/* ANIMATED WALKING STUDENTS WITH MOVING LIMBS             */}
        {/* ======================================================== */}
        {[
          { x: 380, y: 320, color: "#38bdf8", speed: 1.0 },
          { x: 430, y: 350, color: "#f43f5e", speed: 1.2 },
          { x: 570, y: 360, color: "#a855f7", speed: 0.9 },
          { x: 620, y: 390, color: "#22c55e", speed: 1.1 },
          { x: 480, y: 460, color: "#f59e0b", speed: 1.0 },
          { x: 530, y: 450, color: "#06b6d4", speed: 0.8 },
        ].map((student, i) => {
          const swing = Math.sin(pedestrianCycle * student.speed + i);
          return (
            <g key={i} transform={`translate(${student.x}, ${student.y})`}>
              <ellipse cx="0" cy="6" rx="4" ry="2" fill="#000000" opacity="0.25" />
              {/* Head */}
              <circle cx="0" cy="-12" r="3.2" fill="#fed7aa" />
              {/* Torso */}
              <rect x="-3" y="-9" width="6" height="8" rx="2" fill={student.color} />
              {/* Legs swinging */}
              <line
                x1="-2"
                y1="-1"
                x2={-2 + swing * 3}
                y2={6}
                stroke="#1e293b"
                strokeWidth="2"
              />
              <line
                x1="2"
                y1="-1"
                x2={2 - swing * 3}
                y2={6}
                stroke="#1e293b"
                strokeWidth="2"
              />
              {/* Arms swinging */}
              <line
                x1="-3"
                y1="-7"
                x2={-3 - swing * 2}
                y2="-1"
                stroke="#fed7aa"
                strokeWidth="1.5"
              />
              <line
                x1="3"
                y1="-7"
                x2={3 + swing * 2}
                y2="-1"
                stroke="#fed7aa"
                strokeWidth="1.5"
              />
            </g>
          );
        })}
      </svg>

      {/* Interactive Building Hover Info Card */}
      {hoveredBuilding && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none rounded-xl bg-slate-900/90 px-4 py-2.5 text-white shadow-2xl backdrop-blur-md border border-emerald-500/30 text-xs animate-in fade-in zoom-in-95 duration-200">
          <p className="font-bold text-emerald-400">
            {hoveredBuilding === "Admin" && "Central Administration Tower"}
            {hoveredBuilding === "Academic" && "Academic & Engineering Quad"}
            {hoveredBuilding === "Library" && "Central Library & Innovation Hub"}
            {hoveredBuilding === "Sports" && "Student Recreation & Sports Dome"}
            {hoveredBuilding === "Research" && "Research Labs & Incubator"}
          </p>
          <p className="text-[11px] text-slate-300 mt-0.5">
            {hoveredBuilding === "Admin" && "Registrar • IT office • Vice-Chancellor's Secretariat (Live: 88%)"}
            {hoveredBuilding === "Academic" && "Lecture Halls 101–408 • Engineering Labs (Capacity: 92%)"}
            {hoveredBuilding === "Library" && "Open 24/7 • Digital Commons • 45,000 Academic Volumes"}
            {hoveredBuilding === "Sports" && "Indoor Gymnasium • Fitness Complex • Active"}
            {hoveredBuilding === "Research" && "AI Research Lab • High-Performance Compute Cluster • Active"}
          </p>
        </div>
      )}

      {/* Campus Telemetry Footer Overlay */}
      <div className="absolute bottom-6 right-6 z-20 flex items-center gap-3">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-900/85 px-4 py-2.5 text-white shadow-xl backdrop-blur-md border border-white/10 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-mono text-[11px]">
              Shuttles: <span className="text-emerald-400 font-bold">2 in transit</span>
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-300 font-mono text-[11px]">
              Energy: <span className="text-amber-400 font-bold">98 kW Solar</span>
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex flex-col text-right">
            <span className="font-semibold text-slate-200 text-[11px]">
              TechSpire OS v2.4
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">
              Live Twin Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealisticCampusFallback;
