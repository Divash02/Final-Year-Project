import React, {
  Suspense,
  lazy,
  useState,
  Component,
  ErrorInfo,
  useEffect,
} from "react";
import RealisticCampusFallback from "./campus/RealisticCampusFallback";
import { useCameraPresets, type CameraPreset } from "./campus/Camera";
import { BrandLogo } from "../common/BrandLogo";

// Lazy-load the heavy 3D canvas so Three.js doesn't block the initial paint
// of the login form.
const CampusCanvas = lazy(() => import("./CampusCanvas"));

export interface LoginHeroPanelProps {
  transitioning?: boolean;
  onTransitionComplete?: () => void;
  reducedMotion?: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class CampusErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      "Campus 3D Canvas error caught, activating fallback:",
      error,
      info,
    );
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Non-destructive WebGL capability check without calling loseContext().
 */
function checkWebGLSupport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

type CameraControlsProps = {};

const CAMERA_PRESET_BUTTONS: Array<{ key: string; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "entrance", label: "Entrance" },
  { key: "academic", label: "Academic" },
  { key: "library", label: "Library" },
  { key: "road-level", label: "Road View" },
  { key: "cinematic", label: "Cinematic" },
];

function CameraControls() {
  const { activePreset, setPreset, startCinematic, stopCinematic, cinematicActive } = useCameraPresets();

  return (
    <div className="absolute bottom-6 left-6 z-30 flex flex-wrap items-center gap-2 pointer-events-auto">
      <div className="flex items-center rounded-full bg-slate-900/85 p-1 shadow-lg backdrop-blur-md border border-white/10 text-xs">
        {CAMERA_PRESET_BUTTONS.map((btn) => (
          <button
            key={btn.key}
            type="button"
            onClick={() => {
              if (btn.key === "cinematic") {
                cinematicActive ? stopCinematic() : startCinematic();
              } else {
                setPreset(btn.key as CameraPreset);
              }
            }}
            className={`rounded-full px-3 py-1 font-medium transition ${
              activePreset === btn.key && btn.key !== "cinematic"
                ? "bg-emerald-600 text-white shadow-sm"
                : btn.key === "cinematic" && cinematicActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white"
            }`}
            title={btn.label}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type ViewMode = "animated" | "3d";

export const LoginHeroPanel: React.FC<LoginHeroPanelProps> = ({
  transitioning = false,
  onTransitionComplete,
}) => {
  const [webglSupported, setWebglSupported] = useState<boolean>(() =>
    checkWebGLSupport(),
  );

  // Default to the hyper-realistic animated simulation so it stays active continuously
  // and never cuts off after 1 second.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem("campus_sim_mode") as ViewMode) || "animated";
  });

  const handleModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("campus_sim_mode", mode);
  };

  return (
    <div className="hidden min-h-0 min-w-0 lg:col-span-7 lg:flex xl:col-span-7">
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-[#f0f4f8]">
        {/* Top Control Bar: Mode Toggle & Status */}
        <div className="absolute top-6 right-6 z-30 flex items-center gap-2 pointer-events-none">
          {webglSupported && (
            <div className="flex items-center rounded-full bg-slate-900/80 p-1 shadow-lg backdrop-blur-md border border-white/10 text-xs pointer-events-auto">
              <button
                type="button"
                onClick={() => handleModeChange("animated")}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  viewMode === "animated"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
                title="Continuous Hyper-Realistic Campus Simulation"
              >
                Live Twin
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("3d")}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  viewMode === "3d"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
                title="Interactive 3D WebGL Orbit Scene"
              >
                3D Orbit
              </button>
            </div>
          )}
        </div>

        {/* Camera Preset Controls (3D mode only) */}
        {viewMode === "3d" && webglSupported && <CameraControls />}

        {/* Primary View: Persistent Continuous Animated Simulation */}
        {viewMode === "animated" || !webglSupported ? (
          <RealisticCampusFallback
            transitioning={transitioning}
            onTransitionComplete={onTransitionComplete}
          />
        ) : (
          <CampusErrorBoundary
            fallback={
              <RealisticCampusFallback
                transitioning={transitioning}
                onTransitionComplete={onTransitionComplete}
              />
            }
            onError={() => {
              setWebglSupported(false);
              setViewMode("animated");
            }}
          >
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center bg-[#f0f4f8]">
                  <div className="flex flex-col items-center gap-2 text-slate-500 text-xs">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                    <span>Loading 3D Campus Scene...</span>
                  </div>
                </div>
              }
            >
              <CampusCanvas
                transitioning={transitioning}
                onTransitionComplete={onTransitionComplete}
              />
            </Suspense>
          </CampusErrorBoundary>
        )}

        {/* Brand overlay — always visible regardless of mode */}
        <div
          className="pointer-events-none absolute bottom-6 left-6 z-10 flex items-center gap-3 rounded-2xl bg-white/85 px-4 py-3 shadow-lg backdrop-blur-md border border-white/50"
          aria-hidden={!transitioning ? "true" : undefined}
        >
          <BrandLogo size={36} bordered className="rounded-xl" />
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-500">
              COLLEGEOS
            </p>
            <p className="text-sm font-medium text-slate-800">
              Your college, operating as one.
            </p>
          </div>
        </div>

        {transitioning && (
          <div
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-white transition-opacity duration-700"
            aria-label="Signing in"
          />
        )}
      </div>
    </div>
  );
};

export default LoginHeroPanel;
