/**
 * CampusCanvas — the Three.js / @react-three/fiber WebGL surface.
 *
 * This module is intentionally kept separate from LoginHeroPanel so that
 * `React.lazy()` can split Three.js (≈600 kB) into its own async chunk.
 * The login form paints immediately; the 3D campus loads in the background.
 */
import React, { Suspense } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { CampusScene } from "./campus/CampusScene";

interface CampusCanvasProps {
  transitioning: boolean;
  onTransitionComplete?: () => void;
}

export default function CampusCanvas({
  transitioning,
  onTransitionComplete,
}: CampusCanvasProps) {
  return (
    <Canvas
      className="absolute inset-0 h-full w-full"
      camera={{
        position: [42, 28, 36],
        fov: 42,
        near: 0.1,
        far: 500,
      }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false,
        stencil: false,
      }}
      onCreated={(state) => {
        state.gl.setClearColor(0x87ceeb);
        state.gl.shadowMap.type = THREE.PCFSoftShadowMap;
        state.gl.shadowMap.enabled = true;
        state.gl.shadowMap.autoUpdate = true;
        state.gl.toneMapping = THREE.ACESFilmicToneMapping;
        state.gl.outputColorSpace = THREE.SRGBColorSpace;
        state.gl.toneMappingExposure = 1.0;
      }}
    >
      <color attach="background" args={["#87ceeb"]} />
      <Suspense fallback={null}>
        <CampusScene
          transitioning={transitioning}
          onTransitionComplete={onTransitionComplete}
          active={true}
        />
      </Suspense>
    </Canvas>
  );
}
