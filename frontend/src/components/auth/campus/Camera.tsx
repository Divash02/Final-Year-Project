import { useRef, useMemo, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { create } from "zustand";
import { BUILDINGS } from "./constants";
import type { BuildingDef } from "./constants";

export type CameraPreset =
  | "overview"
  | "entrance"
  | "academic"
  | "administration"
  | "library"
  | "student-center"
  | "road-level"
  | "cinematic";

export interface CameraPresetConfig {
  name: CameraPreset;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface CameraStore {
  activePreset: CameraPreset;
  cinematicActive: boolean;
  setPreset: (preset: CameraPreset) => void;
  reset: () => void;
  startCinematic: () => void;
  stopCinematic: () => void;
}

function getBuildingInfo(id: string): { position: [number, number, number]; size: [number, number, number] } {
  const b = BUILDINGS.find((b) => b.id === id);
  return b
    ? { position: b.position, size: b.size }
    : { position: [0, 0, 0], size: [0, 0, 0] };
}

export function getCameraPresets(): Record<CameraPreset, CameraPresetConfig> {
  const academic = getBuildingInfo("academic");
  const admin = getBuildingInfo("administration");
  const library = getBuildingInfo("library");
  const studentCenter = getBuildingInfo("student-center");

  return {
    overview: {
      name: "overview",
      label: "Campus Overview",
      position: [42, 28, 36],
      target: [0, 4, 0],
      fov: 42,
    },
    entrance: {
      name: "entrance",
      label: "Main Entrance",
      position: [0, 4, -24],
      target: [0, 2, -28],
      fov: 50,
    },
    academic: {
      name: "academic",
      label: "Academic Building",
      position: [academic.position[0] + 26, 11, academic.position[2] + 10],
      target: [academic.position[0], academic.size[1] / 2 + 2, academic.position[2]],
      fov: 48,
    },
    administration: {
      name: "administration",
      label: "Administration",
      position: [admin.position[0] + 16, 8, admin.position[2] + 10],
      target: [admin.position[0], admin.size[1] / 2 + 1, admin.position[2]],
      fov: 48,
    },
    library: {
      name: "library",
      label: "Library",
      position: [library.position[0] + 18, 14, library.position[2] + 8],
      target: [library.position[0], library.size[1] / 2 + 2, library.position[2]],
      fov: 48,
    },
    "student-center": {
      name: "student-center",
      label: "Student Center",
      position: [studentCenter.position[0] + 18, 6, studentCenter.position[2] + 10],
      target: [studentCenter.position[0], studentCenter.size[1] / 2 + 1, studentCenter.position[2]],
      fov: 48,
    },
    "road-level": {
      name: "road-level",
      label: "Road Level",
      position: [2, 2.5, 10],
      target: [2, 2, 0],
      fov: 60,
    },
    cinematic: {
      name: "cinematic",
      label: "Cinematic Tour",
      position: [0, 3, -24],
      target: [0, 3, 0],
      fov: 45,
    },
  };
}

const CINEMATIC_WAYPOINTS: CameraPreset[] = [
  "entrance",
  "administration",
  "academic",
  "library",
  "student-center",
  "overview",
];

const CAMERA_TWEEN_SPEED = 2.0;
const CINEMATIC_DURATION = 5.0;
const CINEMATIC_TRANSITION_TIME = 0.8;

const useCameraStore = create<CameraStore>((set) => ({
  activePreset: "overview",
  cinematicActive: false,
  setPreset: (preset) => set({ activePreset: preset, cinematicActive: false }),
  reset: () => set({ activePreset: "overview", cinematicActive: false }),
  startCinematic: () => set({ cinematicActive: true }),
  stopCinematic: () => set({ cinematicActive: false }),
}));

export function useCameraPresets(): CameraStore & {
  presets: Record<CameraPreset, CameraPresetConfig>;
} {
  const store = useCameraStore();
  const presets = useMemo(() => getCameraPresets(), []);
  return { ...store, presets };
}

interface CameraManagerProps {
  transitioning?: boolean;
  transitionPhase?: "idle" | "fading" | "completed";
}

export function CameraManager({
  transitioning = false,
  transitionPhase = "idle",
}: CameraManagerProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  const store = useCameraStore();
  const presets = useMemo(() => getCameraPresets(), []);

  const targetPosRef = useRef<THREE.Vector3>(
    new THREE.Vector3(...presets[store.activePreset].position),
  );
  const targetTargetRef = useRef<THREE.Vector3>(
    new THREE.Vector3(...presets[store.activePreset].target),
  );
  const fovTargetRef = useRef(presets[store.activePreset].fov);

  const cinematicTimerRef = useRef(0);
  const cinematicIndexRef = useRef(0);

  const updateTargetForPreset = useCallback(
    (preset: CameraPreset) => {
      const p = presets[preset];
      targetPosRef.current.copy(
        new THREE.Vector3(p.position[0], p.position[1], p.position[2]),
      );
      targetTargetRef.current.copy(
        new THREE.Vector3(p.target[0], p.target[1], p.target[2]),
      );
      fovTargetRef.current = p.fov;
      cinematicTimerRef.current = 0;
    },
    [presets],
  );

  useEffect(() => {
    updateTargetForPreset(store.activePreset);
  }, [store.activePreset, updateTargetForPreset]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enableRotate = !store.cinematicActive && (!transitioning || transitionPhase === "completed");
      controlsRef.current.update();
    }
  }, [store.cinematicActive, transitioning, transitionPhase]);

  useFrame((_, delta) => {
    if (!controlsRef.current || !camera) return;

    const ctrl = controlsRef.current;

    if (transitioning && transitionPhase !== "completed") {
      ctrl.enableRotate = false;
      ctrl.enableZoom = false;
      ctrl.enablePan = false;
      return;
    }

    if (store.cinematicActive) {
      cinematicTimerRef.current += delta;
      const t = Math.min(1, cinematicTimerRef.current / CINEMATIC_DURATION);

      if (t >= 1) {
        cinematicIndexRef.current = (cinematicIndexRef.current + 1) % CINEMATIC_WAYPOINTS.length;
        store.setPreset(CINEMATIC_WAYPOINTS[cinematicIndexRef.current]);
        cinematicTimerRef.current = 0;
      }

      const eased = 0.5 - Math.cos(Math.PI * t) / 2;

      const currentPreset = store.activePreset;
      const nextIdx = (CINEMATIC_WAYPOINTS.indexOf(currentPreset) + 1) % CINEMATIC_WAYPOINTS.length;
      const fromPreset = presets[currentPreset];
      const toPreset = presets[CINEMATIC_WAYPOINTS[nextIdx]];

      const pos = new THREE.Vector3(
        THREE.MathUtils.lerp(fromPreset.position[0], toPreset.position[0], eased),
        THREE.MathUtils.lerp(fromPreset.position[1], toPreset.position[1], eased),
        THREE.MathUtils.lerp(fromPreset.position[2], toPreset.position[2], eased),
      );

      const tgt = new THREE.Vector3(
        THREE.MathUtils.lerp(fromPreset.target[0], toPreset.target[0], eased),
        THREE.MathUtils.lerp(fromPreset.target[1], toPreset.target[1], eased),
        THREE.MathUtils.lerp(fromPreset.target[2], toPreset.target[2], eased),
      );

      const cam = camera as THREE.PerspectiveCamera;
      camera.position.lerp(targetPosRef.current, 0.15);
      ctrl.target.lerp(targetTargetRef.current, 0.15);
      cam.fov = THREE.MathUtils.lerp(cam.fov, toPreset.fov, 0.15);
      camera.updateProjectionMatrix();
      ctrl.update();
      return;
    }

    const dt = Math.min(delta, 0.1);
    const factor = 1 - Math.exp(-CAMERA_TWEEN_SPEED * dt);

    const cam = camera as THREE.PerspectiveCamera;
    camera.position.lerp(targetPosRef.current, factor);
    ctrl.target.lerp(targetTargetRef.current, factor);
    cam.fov = THREE.MathUtils.lerp(cam.fov, fovTargetRef.current, factor * 0.5);
    cam.updateProjectionMatrix();
    ctrl.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={!transitioning || transitionPhase === "completed"}
      enableDamping
      dampingFactor={0.08}
      enablePan={true}
      panSpeed={0.7}
      rotateSpeed={0.5}
      zoomSpeed={1.0}
      minDistance={8}
      maxDistance={140}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2.1}
      target={[0, 3, 0]}
    />
  );
}

export default CameraManager;
