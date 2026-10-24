import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { TIME_CONFIGS, TimeOfDay } from "./constants";

interface LightingProps {
  timeOfDay: TimeOfDay;
  windowLightsOn: boolean;
  buildingGroups: THREE.Group[];
}

function useSimulatedTime(speed = 200): number {
  const startRef = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (startRef.current === null) startRef.current = clock.elapsedTime;
  });

  return startRef.current ?? 0;
}

export function useTimeOfDay(speed = 300): {
  timeOfDay: TimeOfDay;
  timeFraction: number;
  hour: number;
  windowLightsOn: boolean;
} {
  const startTimeRef = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (startTimeRef.current === null) startTimeRef.current = clock.elapsedTime;
  });

  const elapsed = startTimeRef.current ?? 0;
  const cycle = (elapsed / speed) % 1;

  let timeOfDay: TimeOfDay;
  let hour: number;

  if (cycle < 0.25) {
    timeOfDay = "day";
    hour = 7 + cycle * 4 * 5;
  } else if (cycle < 0.45) {
    timeOfDay = "evening";
    hour = 12 + (cycle - 0.25) * (0.45 - 0.25) * 2 * 6;
  } else if (cycle < 0.6) {
    timeOfDay = "night";
    hour = 19 + (cycle - 0.45) * (0.6 - 0.45) * 2 * 3;
  } else {
    timeOfDay = "day";
    hour = 22 + (cycle - 0.6) * (0.25 - 0.6) * 2 * 5;
  }

  const windowLightsOn = timeOfDay !== "day";
  const cycleBrightness = cycle < 0.25 || cycle > 0.85 ? 1 : cycle < 0.45 ? 0.7 + (cycle - 0.25) * 6 : cycle < 0.6 ? 0.3 : 0.3 + (cycle - 0.6) * 2;

  return {
    timeOfDay,
    timeFraction: cycle,
    hour,
    windowLightsOn,
  };
}

export function CampusLighting({
  timeOfDay,
  windowLightsOn,
  buildingGroups,
}: LightingProps) {
  const { scene } = useThree();

  const sunRef = useRef<THREE.DirectionalLight>(null!);
  const ambientRef = useRef<THREE.AmbientLight>(null!);
  const hemiRef = useRef<THREE.HemisphereLight>(null!);

  const config = useMemo(() => TIME_CONFIGS[timeOfDay], [timeOfDay]);

  const sunPosition = useMemo(() => {
    switch (timeOfDay) {
      case "evening":
        return [8, 6, 5] as [number, number, number];
      case "night":
        return [8, 20, -5] as [number, number, number];
      default:
        return [18, 28, 12] as [number, number, number];
    }
  }, [timeOfDay]);

  useFrame(() => {
    if (sunRef.current) {
      sunRef.current.position.set(sunPosition[0], sunPosition[1], sunPosition[2]);
      sunRef.current.intensity = config.sunIntensity;
      sunRef.current.color.set(config.sunColor);
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = config.ambientIntensity;
      ambientRef.current.color.set(config.ambientColor);
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = config.ambientIntensity * 0.7;
    }
  });

  // Update building window lighting
  useMemo(() => {
    buildingGroups.forEach((group) => {
      const windows = group.userData.windows as THREE.Mesh[] | undefined;
      if (!windows) return;

      windows.forEach((window) => {
        const isLit = window.userData.isLit;

        if (timeOfDay === "night") {
          if (isLit && windowLightsOn) {
            const mat = window.material as THREE.MeshStandardMaterial;
            const newMat = mat.clone();
            newMat.color.set("#ffd870");
            newMat.emissive = new THREE.Color("#ffd870");
            newMat.emissiveIntensity = 0.4 + Math.random() * 0.3;
            newMat.transparent = true;
            newMat.opacity = 0.9;
            newMat.depthWrite = false;
            window.material = newMat;
          }
        } else if (timeOfDay === "day") {
          const original = (window.material as any).__original as THREE.MeshStandardMaterial | undefined;
          if (original) {
            window.material = original;
          }
        } else {
          // Evening - partial lighting
          if (isLit) {
            const mat = window.material as THREE.MeshStandardMaterial;
            const newMat = mat.clone();
            newMat.color.set("#ffd870");
            newMat.emissive = new THREE.Color("#ffd870");
            newMat.emissiveIntensity = 0.2 + Math.random() * 0.15;
            newMat.transparent = true;
            newMat.opacity = 0.7;
            window.material = newMat;
          }
        }
      });
    });
  }, [timeOfDay, windowLightsOn, buildingGroups]);

  // Street lights
  const streetLightPositions: [number, number, number][] = [
    [0, 5, -10], [0, 5, 10], [-10, 5, 0], [10, 5, 0],
    [-16, 5, -8], [16, 5, -8], [-18, 5, 2], [18, 5, 2],
    [-16, 5, 10], [16, 5, 10], [0, 5, 20], [0, 5, -24],
  ];

  return (
    <group>
      <directionalLight
        ref={sunRef}
        position={[15, 25, 10]}
        castShadow
        shadow-map-size={[2048, 2048]}
        shadow-camera-top={60}
        shadow-camera-bottom={-40}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-near={1}
        shadow-camera-far={100}
        shadow-bias={-0.0005}
      />

      <ambientLight ref={ambientRef} />

      <hemisphereLight
        ref={hemiRef}
        color={config.skyColor}
        groundColor="#4a5c3a"
        position={[0, 25, 0]}
      />

      {streetLightPositions.map((pos, i) => {
        const poleMat = new THREE.MeshStandardMaterial({ color: "#2d3748", metalness: 0.5 });
        const lightMat = new THREE.MeshStandardMaterial({ color: "#ffd24c", emissive: "#ffd24c", transparent: true, opacity: 0 });

        return (
          <group key={i} position={[pos[0], 0, pos[2]]}>
            <mesh geometry={new THREE.CylinderGeometry(0.12, 0.12, 4, 8)} material={poleMat} position={[0, 2, 0]} castShadow />
            <mesh geometry={new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8)} material={poleMat} position={[0, 4, 0]} />
            <pointLight
              color="#ffd24c"
              intensity={config.streetLightOn ? 0.8 : 0}
              distance={12}
              decay={2}
              position={[0, 4, 0]}
            />
            <mesh geometry={new THREE.SphereGeometry(0.08, 12, 12)} material={lightMat} position={[0, 4, 0]} />
          </group>
        );
      })}
    </group>
  );
}

export function SkyDome({ timeOfDay = "day" as TimeOfDay }) {
  const { scene } = useThree();

  const skyColors = useMemo(() => {
    switch (timeOfDay) {
      case "night":
        return {
          topColor: new THREE.Color("#020210"),
          bottomColor: new THREE.Color("#0a0f20"),
        };
      case "evening":
        return {
          topColor: new THREE.Color("#1a1a3a"),
          bottomColor: new THREE.Color("#4a2c1a"),
        };
      default:
        return {
          topColor: new THREE.Color("#87ceeb"),
          bottomColor: new THREE.Color("#e0f2fe"),
        };
    }
  }, [timeOfDay]);

  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: skyColors.topColor },
          bottomColor: { value: skyColors.bottomColor },
          offset: { value: 33.0 },
          exponent: { value: 0.6 },
        },
        vertexShader: `
          uniform float offset;
          uniform float exponent;
          varying vec3 vCoord;
          void main() {
            vCoord = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 bottomColor;
          uniform float offset;
          uniform float exponent;
          varying vec3 vCoord;
          void main() {
            float h = max(vCoord.y / offset, 0.0);
            gl_FragColor = mix(bottomColor, topColor, pow(h, exponent));
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [skyColors],
  );

  return (
    <mesh geometry={new THREE.SphereGeometry(280, 32, 32)} material={skyMat} />
  );
}

export function Fog({ timeOfDay = "day" as TimeOfDay }) {
  const { scene } = useThree();

  const fogColor = useMemo(() => {
    switch (timeOfDay) {
      case "night":
        return new THREE.Color("#050a14");
      case "evening":
        return new THREE.Color("#2a1a2a");
      default:
        return new THREE.Color("#a0b8d0");
    }
  }, [timeOfDay]);

  const fogDensity = useMemo(() => {
    switch (timeOfDay) {
      case "night":
        return 0.003;
      case "evening":
        return 0.002;
      default:
        return 0.0018;
    }
  }, [timeOfDay]);

  useEffect(() => {
    scene.fog = new THREE.FogExp2(fogColor, fogDensity);
    return () => {
      scene.fog = null;
    };
  }, [scene, fogColor, fogDensity]);

  return null;
}

export default CampusLighting;
