import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

const TREE_COUNT = 60;
const SHRUB_COUNT = 120;
const GRASS_CLUMP_COUNT = 200;

const PARK_AREA_MIN = new THREE.Vector3(-28, 0, -8);
const PARK_AREA_MAX = new THREE.Vector3(28, 0, 8);

function treePositions(): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];

  for (let i = 0; i < TREE_COUNT; ) {
    const x = THREE.MathUtils.randFloatSpread(80);
    const z = THREE.MathUtils.randFloatSpread(60);

    const inPark = x > PARK_AREA_MIN.x && x < PARK_AREA_MAX.x && z > PARK_AREA_MIN.z && z < PARK_AREA_MAX.z;
    const nearBuilding = x > -12 && x < 12 && z > -8 && z < 8;

    if ((x > -18 && x < 18) || nearBuilding) {
      if (!inPark && !nearBuilding) {
        continue;
      }
    }

    if (x > -4 && x < 4 && z > -3 && z < 3) continue;

    positions.push(new THREE.Vector3(x, 0, z));
    i++;
  }

  return positions;
}

function shrubPositions(): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < SHRUB_COUNT; i++) {
    const x = THREE.MathUtils.randFloatSpread(80);
    const z = THREE.MathUtils.randFloatSpread(60);
    if (x > -4 && x < 4 && z > -3 && z < 3) continue;
    positions.push(new THREE.Vector3(x, 0, z));
  }
  return positions;
}

function grassClumpPositions(): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < GRASS_CLUMP_COUNT; i++) {
    const x = THREE.MathUtils.randFloatSpread(80);
    const z = THREE.MathUtils.randFloatSpread(60);
    if (x > -4 && x < 4 && z > -3 && z < 3) continue;
    const y = THREE.MathUtils.randFloat(0.01, 0.03);
    positions.push(new THREE.Vector3(x, y, z));
  }
  return positions;
}

const TREE_GEOMETRIES = [
  new THREE.ConeGeometry(0.6, 4, 8),
  new THREE.ConeGeometry(0.8, 5, 8),
  new THREE.SphereGeometry(0.8, 12, 12),
  new THREE.ConeGeometry(0.5, 3.5, 8),
  new THREE.ConeGeometry(0.9, 5.5, 8),
];

const BARK_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#8b5a2b",
  roughness: 0.8,
  metalness: 0.1,
});

const NEEDLE_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#1a4d1a",
  roughness: 0.7,
  metalness: 0.0,
});

const LEAF_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#2e8b57",
  roughness: 0.6,
  metalness: 0.0,
});

const SHRUB_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#3a7d3a",
  roughness: 0.7,
  metalness: 0.05,
});

const GRASS_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#4a8c4a",
  roughness: 0.8,
  metalness: 0.0,
  side: THREE.DoubleSide,
});

function Tree({ position, scale = 1, type = "pine" }: { position: THREE.Vector3; scale?: number; type?: string }) {
  const groupRef = useRef<THREE.Group>(null!);

  const trunkHeight = 0.5 + Math.random() * 0.5;
  const trunkRadius = 0.1 + Math.random() * 0.15;
  const trunkGeom = useMemo(() => new THREE.CylinderGeometry(trunkRadius, trunkRadius + 0.05, trunkHeight, 8), [trunkRadius, trunkHeight]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const wind = Math.sin(clock.elapsedTime * 0.7 + position.x * 0.3 + position.z * 0.5) * 0.02;
    groupRef.current.rotation.z = wind;
    groupRef.current.rotation.x = wind * 0.5;
  });

  const treeY = trunkHeight / 2 + 0.1;

  return (
    <group ref={groupRef} position={[position.x, 0, position.z]}>
      <mesh geometry={trunkGeom} material={BARK_MATERIAL} position={[0, treeY, 0]} castShadow receiveShadow />
      <group position={[0, trunkHeight + 0.3, 0]}>
        {type === "oak" ? (
          <mesh geometry={TREE_GEOMETRIES[2]} material={LEAF_MATERIAL} scale={scale * 0.8} castShadow receiveShadow />
        ) : (
          <>
            <mesh
              geometry={TREE_GEOMETRIES[1]}
              material={NEEDLE_MATERIAL}
              position={[0, 1.8, 0]}
              scale={scale * 0.9}
              castShadow
              receiveShadow
            />
            <mesh
              geometry={TREE_GEOMETRIES[1]}
              material={NEEDLE_MATERIAL}
              position={[0, 2.8, 0.6]}
              scale={scale * 0.75}
              castShadow
              receiveShadow
            />
            <mesh
              geometry={TREE_GEOMETRIES[1]}
              material={NEEDLE_MATERIAL}
              position={[0, 2.8, -0.6]}
              scale={scale * 0.75}
              castShadow
              receiveShadow
            />
          </>
        )}
      </group>
    </group>
  );
}

function ShrubCluster({ position }: { position: THREE.Vector3 }) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const wind = Math.sin(clock.elapsedTime * 0.9 + position.x * 0.4 + position.z * 0.6) * 0.015;
    groupRef.current.rotation.z = wind;
  });

  const clusterSize = 3 + Math.floor(Math.random() * 5);

  return (
    <group ref={groupRef} position={[position.x, 0, position.z]}>
      {Array.from({ length: clusterSize }).map((_, i) => {
        const offsetX = (Math.random() - 0.5) * 1.8;
        const offsetZ = (Math.random() - 0.5) * 1.8;
        const y = Math.random() * 0.2;
        const scale = 0.4 + Math.random() * 0.6;
        const sphereGeom = new THREE.SphereGeometry(scale * 0.5, 8, 8);
        return (
          <mesh
            key={i}
            geometry={sphereGeom}
            material={SHRUB_MATERIAL}
            position={[offsetX, y, offsetZ]}
            castShadow
            receiveShadow
          />
        );
      })}
    </group>
  );
}

function GrassClump({ position }: { position: THREE.Vector3 }) {
  const bladeCount = 8 + Math.floor(Math.random() * 6);

  return (
    <group position={[position.x, position.y, position.z]}>
      {Array.from({ length: bladeCount }).map((_, i) => {
        const angle = (i / bladeCount) * Math.PI * 2;
        const length = 0.1 + Math.random() * 0.12;
        const x = Math.cos(angle) * 0.05;
        const z = Math.sin(angle) * 0.05;
        const geometry = new THREE.PlaneGeometry(0.03, length);
        return (
          <mesh
            key={i}
            geometry={geometry}
            material={GRASS_MATERIAL}
            position={[x, length / 2, z]}
            rotation={[0, angle, Math.sin(angle) * 0.1]}
            castShadow
            receiveShadow
            renderOrder={2}
          />
        );
      })}
    </group>
  );
}

export function Vegetation() {
  const trees = useMemo(() => treePositions(), []);
  const shrubs = useMemo(() => shrubPositions(), []);
  const grassClumps = useMemo(() => grassClumpPositions(), []);

  return (
    <group>
      {trees.map((pos, i) => {
        const type = i % 3 === 0 ? "oak" : "pine";
        const scale = 0.7 + Math.random() * 0.8;
        return <Tree key={`tree-${i}`} position={pos} scale={scale} type={type} />;
      })}
      {shrubs.map((pos, i) => (
        <ShrubCluster key={`shrub-${i}`} position={pos} />
      ))}
      {grassClumps.map((pos, i) => (
        <GrassClump key={`grass-${i}`} position={pos} />
      ))}

      <Tree position={new THREE.Vector3(-10, 0, -15)} scale={2} type="oak" />
      <Tree position={new THREE.Vector3(-14, 0, -11)} scale={1.8} type="oak" />
      <Tree position={new THREE.Vector3(-12, 0, -18)} scale={1.5} type="pine" />

      <Tree position={new THREE.Vector3(10, 0, -15)} scale={2} type="pine" />
      <Tree position={new THREE.Vector3(14, 0, -11)} scale={1.6} type="pine" />
      <Tree position={new THREE.Vector3(12, 0, -18)} scale={1.8} type="oak" />

      <Tree position={new THREE.Vector3(-18, 0, 12)} scale={1.7} type="pine" />
      <Tree position={new THREE.Vector3(18, 0, 12)} scale={1.5} type="oak" />
      <Tree position={new THREE.Vector3(-20, 0, 18)} scale={1.9} type="pine" />
      <Tree position={new THREE.Vector3(20, 0, 18)} scale={1.6} type="oak" />

      <Tree position={new THREE.Vector3(-8, 0, 20)} scale={1.4} type="oak" />
      <Tree position={new THREE.Vector3(8, 0, 20)} scale={1.7} type="pine" />

      <Tree position={new THREE.Vector3(-5, 0, -22)} scale={2.2} type="oak" />
      <Tree position={new THREE.Vector3(5, 0, -22)} scale={2.1} type="pine" />
    </group>
  );
}
