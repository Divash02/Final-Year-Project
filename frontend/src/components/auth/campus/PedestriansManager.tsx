import React, { useState, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CharacterType,
  CHARACTER_PRESETS,
  PEDESTRIAN_PATHS,
  BUILDING_ENTRANCES,
  seededRandom,
  pickSeeded,
} from "./constants";
import { PedestrianConfig, WalkingPerson } from "./Pedestrians";

export interface PedestrianManagerProps {
  active: boolean;
  enabled: boolean;
  timeOfDay: "day" | "evening" | "night";
  transitionPhase?: "idle" | "fading" | "completed";
}

const MAX_PEDESTRIANS = 28;
const SPAWN_INTERVAL_MS = 180;
const GROUP_CHANCE = 0.25;
const GROUP_SIZE_RANGE: [number, number] = [2, 5];

const CHARACTER_TYPES: CharacterType[] = ["student", "student", "student", "faculty", "faculty", "security", "maintenance"];

function pickCharacterType(seed: number): CharacterType {
  return pickSeeded(CHARACTER_TYPES, seed);
}

function createPedestrianConfig(id: string, seed: number): PedestrianConfig {
  const type = pickCharacterType(seed);
  const preset = CHARACTER_PRESETS[type];
  const height = preset.height * (0.92 + seededRandom(seed) * 0.16);
  const speed = pickSeeded(preset.walkSpeed, seed + 42) * (0.9 + Math.random() * 0.3);

  const pathIdx = seed % PEDESTRIAN_PATHS.length;
  const path = PEDESTRIAN_PATHS[pathIdx];
  const startPoint = path[0];
  const endPoint = path[path.length - 1];

  const buildingKeys = Object.keys(BUILDING_ENTRANCES);
  const destKey = buildingKeys[seed % buildingKeys.length];

  return {
    id,
    type,
    seed,
    height,
    walkSpeed: speed,
    phase: seededRandom(seed * 17) * Math.PI * 2,
    startX: startPoint.position[0] + (seededRandom(seed * 31) - 0.5) * 4,
    startZ: startPoint.position[2] + (seededRandom(seed * 43) - 0.5) * 4,
    targetX: endPoint.position[0] + (seededRandom(seed * 55) - 0.5) * 6,
    targetZ: endPoint.position[2] + (seededRandom(seed * 67) - 0.5) * 6,
    direction: startPoint.direction + (seededRandom(seed * 71) - 0.5) * 0.5,
    destinationBuilding: destKey,
  };
}

function createGroupPedestrians(baseId: string, baseSeed: number, count: number): PedestrianConfig[] {
  const configs: PedestrianConfig[] = [];
  const pathIdx = baseSeed % PEDESTRIAN_PATHS.length;
  const path = PEDESTRIAN_PATHS[pathIdx];
  const startPoint = path[0];

  for (let i = 0; i < count; i++) {
    const seed = baseSeed * 100 + i;
    const config = createPedestrianConfig(`${baseId}-${i}`, seed);
    config.startX = startPoint.position[0] + (seededRandom(seed * 31) - 0.4) * 3;
    config.startZ = startPoint.position[2] + (seededRandom(seed * 43) - 0.4) * 3;
    configs.push(config);
  }

  return configs;
}

export function PedestrianManager({
  active,
  enabled,
  timeOfDay,
  transitionPhase = "idle",
}: PedestrianManagerProps) {
  const [pedestrians, setPedestrians] = useState<PedestrianConfig[]>([]);
  const spawnTimerRef = useRef(0);
  const spawnCountRef = useRef(0);

  const activityLevel = useMemo(() => {
    switch (timeOfDay) {
      case "day":
        return 1.0;
      case "evening":
        return 0.75;
      case "night":
        return 0.25;
      default:
        return 1.0;
    }
  }, [timeOfDay]);

  const targetCount = useMemo(() => {
    if (!enabled || !active) return 0;
    const count = Math.floor(MAX_PEDESTRIANS * activityLevel);
    return Math.max(count, 0);
  }, [enabled, active, activityLevel]);

  useFrame(({ clock }) => {
    if (!enabled || !active) return;
    const delta = clock.getDelta();

    spawnTimerRef.current += delta * 1000;

    if (spawnTimerRef.current >= 180 && pedestrians.length < targetCount) {
      spawnTimerRef.current = 0;
      const newPeds: PedestrianConfig[] = [];

      const spawnGroup =
        Math.random() < GROUP_CHANCE && pedestrians.length < targetCount - 2;

      if (spawnGroup) {
        const groupSize = Math.floor(
          GROUP_SIZE_RANGE[0] + Math.random() * (GROUP_SIZE_RANGE[1] - GROUP_SIZE_RANGE[0]),
        );
        const actualSize = Math.min(groupSize, targetCount - pedestrians.length);
        const seed = spawnCountRef.current++;
        newPeds.push(
          ...createGroupPedestrians(`ped-${spawnCountRef.current}`, seed, actualSize),
        );
      } else {
        const seed = spawnCountRef.current++;
        newPeds.push(createPedestrianConfig(`ped-${seed}`, seed));
      }

      setPedestrians((prev) => [...prev, ...newPeds]);
    }

    if (pedestrians.length > targetCount + 5) {
      setPedestrians((prev) => prev.slice(prev.length - targetCount - 3));
    }
  });

  useEffect(() => {
    if (!active) {
      setPedestrians([]);
    }
  }, [active]);

  const visible = pedestrians.slice(0, targetCount);

  return (
    <group>
      {visible.map((ped) => (
        <WalkingPerson
          key={ped.id}
          config={ped}
          active={active && enabled}
          enabled={enabled}
        />
      ))}
    </group>
  );
}
