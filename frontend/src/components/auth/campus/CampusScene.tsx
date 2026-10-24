import React, { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion, useTabVisibility } from "./useReducedMotion";
import { Ground } from "./Ground";
import { Roads } from "./Roads";
import { Buildings } from "./Buildings";
import { Vegetation } from "./Vegetation";
import { PedestrianManager } from "./PedestriansManager";
import { VehiclesManager } from "./VehiclesManager";
import { CampusLighting, SkyDome, Fog } from "./Lighting";
import { Environment } from "./Environment";
import { CameraManager } from "./Camera";
import { CampusDetails } from "./CampusDetails";
import { BUILDINGS, LOAD_PHASES } from "./constants";
import type { TimeOfDay } from "./constants";

export interface CampusSceneProps {
  transitioning?: boolean;
  onTransitionComplete?: () => void;
  active?: boolean;
}

const CAMERA_START: [number, number, number] = [28, 20, 24];
const CAMERA_TARGET: [number, number, number] = [0, 2, 0];
const ADMIN_POS: [number, number, number] = [-8, 0, 16];

const LOAD_DURATIONS = [0, 500, 1000, 1500, 2000, 3000] as const;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function useTimeOfDay(speed = 200) {
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("day");
  const startTimeRef = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (startTimeRef.current === null) startTimeRef.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - startTimeRef.current;
    const cycle = (elapsed / speed) % 1;

    let newTimeOfDay: TimeOfDay;

    if (cycle < 0.4) {
      newTimeOfDay = "day";
    } else if (cycle < 0.65) {
      newTimeOfDay = "evening";
    } else if (cycle < 0.8) {
      newTimeOfDay = "night";
    } else {
      newTimeOfDay = "day";
    }

    if (newTimeOfDay !== timeOfDay) {
      setTimeOfDay(newTimeOfDay);
    }
  });

  const windowLightsOn = timeOfDay !== "day";
  return { timeOfDay, windowLightsOn };
}

export function CampusScene({
  transitioning = false,
  onTransitionComplete,
  active = true,
}: CampusSceneProps) {
  const { camera } = useThree();
  const reducedMotion = useReducedMotion();
  const tabVisible = useTabVisibility();
  const { timeOfDay, windowLightsOn } = useTimeOfDay();

  const [loadPhaseIndex] = useState(LOAD_PHASES.length - 1);

  const transitionStartRef = useRef<number | null>(null);
  const [transitionPhase, setTransitionPhase] = useState<"idle" | "fading" | "completed">("idle");
  const fadeOpacityRef = useRef(0);
  const fadeMaterialRef = useRef<THREE.MeshBasicMaterial>(null!);
  const cameraDriftRef = useRef(0);

  useEffect(() => {
    if (transitioning && transitionPhase === "idle") {
      setTransitionPhase("fading");
      transitionStartRef.current = performance.now();
    }
  }, [transitioning, transitionPhase]);

  useFrame(() => {
    if (transitionPhase === "fading" && transitionStartRef.current !== null) {
      const elapsed = (performance.now() - transitionStartRef.current) / 1000;
      const progress = Math.min(1, elapsed / 1.5);

      const startCam = new THREE.Vector3(...CAMERA_START);
      const endCam = new THREE.Vector3(ADMIN_POS[0], 6, ADMIN_POS[2]);

      const eased = easeOutCubic(progress);
      const newPos = startCam.clone().lerp(endCam, eased);
      camera.position.lerp(newPos, 0.15);
      camera.lookAt(ADMIN_POS[0], 2, ADMIN_POS[2]);

      fadeOpacityRef.current = easeOutCubic(progress) * 0.95;
      if (fadeMaterialRef.current) {
        fadeMaterialRef.current.opacity = fadeOpacityRef.current;
        fadeMaterialRef.current.transparent = true;
        fadeMaterialRef.current.visible = true;
      }

      if (progress >= 1) {
        setTransitionPhase("completed");
        onTransitionComplete?.();
      }
    } else if (!transitioning && transitionPhase !== "completed") {
      if (fadeOpacityRef.current > 0) {
        fadeOpacityRef.current = Math.max(0, fadeOpacityRef.current - 0.02);
        if (fadeMaterialRef.current) {
          fadeMaterialRef.current.opacity = fadeOpacityRef.current;
          fadeMaterialRef.current.transparent = true;
          fadeMaterialRef.current.visible = fadeOpacityRef.current > 0;
        }
      }
    }
  });

  const simulationEnabled = active && tabVisible;
  const showChars = loadPhaseIndex >= 5;

  return (
    <>
      <Environment timeOfDay={timeOfDay} />
      <CameraManager transitioning={transitioning} transitionPhase={transitionPhase} />

      <ambientLight
        intensity={timeOfDay === "night" ? 0.25 : timeOfDay === "evening" ? 0.4 : 0.4}
        color={timeOfDay === "night" ? "#3a4a5a" : "#b3d9e6"}
      />
      <CampusLighting timeOfDay={timeOfDay} windowLightsOn={windowLightsOn} buildingGroups={[]} />
      <SkyDome timeOfDay={timeOfDay} />
      <Fog timeOfDay={timeOfDay} />

      {loadPhaseIndex >= 1 && <Ground terrainHeight={0.0} />}
      {loadPhaseIndex >= 2 && (
        <Buildings timeOfDay={timeOfDay} windowLightsOn={windowLightsOn} />
      )}
      {loadPhaseIndex >= 3 && <Roads />}
      {loadPhaseIndex >= 3 && <CampusDetails />}
      {loadPhaseIndex >= 4 && <Vegetation />}
      {showChars && (
        <>
          <PedestrianManager
            active={simulationEnabled && !reducedMotion}
            enabled={simulationEnabled && !reducedMotion}
            timeOfDay={timeOfDay}
          />
          <VehiclesManager
            active={simulationEnabled && !reducedMotion}
            enabled={simulationEnabled && !reducedMotion}
            timeOfDay={timeOfDay}
          />
        </>
      )}
    </>
  );
}

export default CampusScene;
