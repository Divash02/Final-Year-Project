import React, { useMemo } from "react";
import * as THREE from "three";
import {
  createAsphaltTexture,
  createAsphaltNormalMap,
  createRoadMarkingTexture,
  createSidewalkTexture,
  createSidewalkNormalMap,
} from "./textures";

function createSignTexture(text: string, bgColor = "#0284c7"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 128, 64);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 128, 64);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 2;
  return tex;
}

export function Roads() {
  const asphaltTexture = useMemo(() => createAsphaltTexture(512), []);
  asphaltTexture.repeat.set(6, 12);
  asphaltTexture.anisotropy = 4;

  const asphaltNormal = useMemo(() => createAsphaltNormalMap(256), []);
  asphaltNormal.repeat.set(6, 12);
  asphaltNormal.anisotropy = 4;

  const markingTexture = useMemo(() => createRoadMarkingTexture(512), []);
  markingTexture.wrapS = THREE.RepeatWrapping;
  markingTexture.wrapT = THREE.RepeatWrapping;

  const sidewalkTexture = useMemo(() => createSidewalkTexture(256), []);
  sidewalkTexture.repeat.set(8, 2);
  sidewalkTexture.anisotropy = 4;

  const sidewalkNormal = useMemo(() => createSidewalkNormalMap(256), []);
  sidewalkNormal.repeat.set(8, 2);
  sidewalkNormal.anisotropy = 4;

  const asphaltMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: asphaltTexture,
        normalMap: asphaltNormal,
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughness: 0.85,
        metalness: 0.05,
        color: "#24272e",
        aoMapIntensity: 0.7,
      }),
    [asphaltTexture, asphaltNormal],
  );

  const markingMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: markingTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        color: "#ffffff",
      }),
    [markingTexture],
  );

  const sidewalkMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: sidewalkTexture,
        normalMap: sidewalkNormal,
        normalScale: new THREE.Vector2(0.2, 0.2),
        roughness: 0.9,
        metalness: 0.0,
        color: "#d0d7de",
        aoMapIntensity: 0.6,
      }),
    [sidewalkTexture, sidewalkNormal],
  );

  const curbMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#4a5568",
        roughness: 0.95,
        metalness: 0.1,
        aoMapIntensity: 0.8,
      }),
    [],
  );

  const whiteLineMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  return (
    <group>
      <MainRoad
        asphaltMat={asphaltMat}
        markingMat={markingMat}
        sidewalkMat={sidewalkMat}
        curbMat={curbMat}
        whiteLineMat={whiteLineMat}
      />
      <RingRoad
        asphaltMat={asphaltMat}
        markingMat={markingMat}
        sidewalkMat={sidewalkMat}
        curbMat={curbMat}
        whiteLineMat={whiteLineMat}
      />
      <PedestrianCrossings asphaltMat={asphaltMat} whiteLineMat={whiteLineMat} />
      <RoadSigns />
      <SpeedBump curbMat={curbMat} />
      <Benches curbMat={curbMat} />
      <ParkingAreas asphaltMat={asphaltMat} markingMat={markingMat} curbMat={curbMat} />
      <StreetLightPoles />
    </group>
  );
}

function MainRoad({
  asphaltMat,
  markingMat,
  sidewalkMat,
  curbMat,
  whiteLineMat,
}: {
  asphaltMat: THREE.MeshStandardMaterial;
  markingMat: THREE.MeshBasicMaterial;
  sidewalkMat: THREE.MeshStandardMaterial;
  curbMat: THREE.MeshStandardMaterial;
  whiteLineMat: THREE.MeshBasicMaterial;
}) {
  const roadGeometry = useMemo(() => new THREE.PlaneGeometry(6, 70), []);
  const sidewalkGeom = useMemo(() => new THREE.PlaneGeometry(4, 64), []);
  const markingGeom = useMemo(() => new THREE.PlaneGeometry(6, 0.02), []);

  return (
    <group position={[0, 0.01, 0]}>
      <mesh geometry={roadGeometry} material={asphaltMat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow />
      <mesh geometry={markingGeom} material={markingMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} />

      <mesh geometry={sidewalkGeom} material={sidewalkMat} rotation={[-Math.PI / 2, 0, 0]} position={[-5, 0.01, 0]} receiveShadow />
      <mesh geometry={sidewalkGeom} material={sidewalkMat} rotation={[-Math.PI / 2, 0, 0]} position={[5, 0.01, 0]} receiveShadow />

      <mesh geometry={new THREE.BoxGeometry(0.3, 0.15, 64)} material={curbMat} position={[-3, 0.075, 0]} receiveShadow castShadow />
      <mesh geometry={new THREE.BoxGeometry(0.3, 0.15, 64)} material={curbMat} position={[3, 0.075, 0]} receiveShadow castShadow />

      <mesh geometry={new THREE.BoxGeometry(6, 0.01, 0.2)} material={whiteLineMat} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
    </group>
  );
}

function RingRoad({
  asphaltMat,
  markingMat,
  sidewalkMat,
  curbMat,
  whiteLineMat,
}: {
  asphaltMat: THREE.MeshStandardMaterial;
  markingMat: THREE.MeshBasicMaterial;
  sidewalkMat: THREE.MeshStandardMaterial;
  curbMat: THREE.MeshStandardMaterial;
  whiteLineMat: THREE.MeshBasicMaterial;
}) {
  const ringRoadWidth = 5;

  const ringRoads = [
    { size: 50, pos: [0, 0, -12.5], rot: [0, 0, 0] as [number, number, number], name: "north" },
    { size: 30, pos: [0, 0, 12.5], rot: [0, 0, 0] as [number, number, number], name: "south" },
    { size: 30, pos: [-22.5, 0, 0], rot: [0, Math.PI / 2, 0] as [number, number, number], name: "west" },
    { size: 30, pos: [22.5, 0, 0], rot: [0, Math.PI / 2, 0] as [number, number, number], name: "east" },
  ];

  const markingLineGeom = useMemo(() => new THREE.PlaneGeometry(1, 0.01), []);

  return (
    <group>
      {ringRoads.map((rr) => {
        const geom = new THREE.PlaneGeometry(rr.size, ringRoadWidth);
        return (
          <group key={rr.name} position={[rr.pos[0], 0.01, rr.pos[2]]} rotation={[rr.rot[0], rr.rot[1], rr.rot[2]]}>
            <mesh geometry={geom} material={asphaltMat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
            <mesh geometry={geom} material={markingMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} />
            <mesh geometry={new THREE.BoxGeometry(rr.size, 0.15, 0.1)} material={curbMat} position={[0, 0.075, ringRoadWidth / 2 + 0.05]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow />
            <mesh geometry={new THREE.BoxGeometry(rr.size, 0.15, 0.1)} material={curbMat} position={[0, 0.075, -ringRoadWidth / 2 - 0.05]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow />
            <mesh geometry={markingLineGeom} material={whiteLineMat} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
          </group>
        );
      })}

      {ringRoads.map((rr) => {
        const swGeom = new THREE.PlaneGeometry(rr.size + 2, 4);
        return (
          <React.Fragment key={`sw-${rr.name}-a`}>
            <mesh
              geometry={swGeom}
              material={sidewalkMat}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[rr.pos[0], 0.01, rr.pos[2] - ringRoadWidth / 2 - 2]}
              receiveShadow
            />
            <mesh
              geometry={swGeom}
              material={sidewalkMat}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[rr.pos[0], 0.01, rr.pos[2] + ringRoadWidth / 2 + 2]}
              receiveShadow
            />
          </React.Fragment>
        );
      })}
    </group>
  );
}

function PedestrianCrossings({
  asphaltMat,
  whiteLineMat,
}: {
  asphaltMat: THREE.MeshStandardMaterial;
  whiteLineMat: THREE.MeshBasicMaterial;
}) {
  const zebraGeom = new THREE.PlaneGeometry(4, 0.2);

  const crossings: [number, number, number][] = [
    [0, 0.02, -4],
    [0, 0.02, 8],
    [0, 0.02, -10],
    [0, 0.02, 14],
  ];

  const zebraMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.95,
        metalness: 0.0,
      }),
    [],
  );

  return (
    <group>
      {crossings.map((pos, i) => (
        <mesh
          key={i}
          geometry={zebraGeom}
          material={zebraMat}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[pos[0], 0.02, pos[2]]}
          receiveShadow
        />
      ))}
    </group>
  );
}

const SIGN_TEXTS = ["MAIN GATE", "CAMPUS", "LIBRARY", "STUDENT CENTER", "ADMIN", "PARKING"];

function RoadSigns() {
  const poleGeom = useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 3, 8), []);
  const signGeom = useMemo(() => new THREE.BoxGeometry(0.2, 1.2, 0.02), []);

  const poleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2d3748", metalness: 0.6, roughness: 0.5 }),
    [],
  );

  const signs = [
    { pos: [0, 0, -28], label: "MAIN GATE" },
    { pos: [-8, 0, -22], label: "ADMIN" },
    { pos: [-20, 0, 0], label: "LIBRARY" },
    { pos: [20, 0, 0], label: "STUDENT CENTER" },
    { pos: [18, 0, -20], label: "PARKING" },
  ];

  const createSignMesh = (label: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 128, 64);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 64, 32);

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  };

  const signTextures = useMemo(
    () => signs.map((s) => createSignMesh(s.label)),
    [signs],
  );

  const signMats = useMemo(
    () => signTextures.map((tex) => new THREE.MeshStandardMaterial({ map: tex, color: "#f8fafc", roughness: 0.6 })),
    [signTextures],
  );

  return (
    <group>
      {signs.map((sign, i) => (
        <group key={i} position={[sign.pos[0], 1.5, sign.pos[2]]}>
          <mesh geometry={poleGeom} material={poleMat} castShadow />
          <mesh
            geometry={signGeom}
            material={signMats[i]}
            position={[0, 1.2, 0]}
            castShadow
            receiveShadow
          />
        </group>
      ))}
    </group>
  );
}

function SpeedBump({ curbMat }: { curbMat: THREE.MeshStandardMaterial }) {
  const bumpGeom = useMemo(() => new THREE.BoxGeometry(6, 0.12, 1.2), []);

  return (
    <group position={[0, 0.06, -6]}>
      <mesh geometry={bumpGeom} material={curbMat} receiveShadow castShadow />
    </group>
  );
}

function Benches({ curbMat }: { curbMat: THREE.MeshStandardMaterial }) {
  const seatGeom = useMemo(() => new THREE.BoxGeometry(1.6, 0.45, 0.45), []);
  const legGeom = useMemo(() => new THREE.BoxGeometry(0.1, 0.42, 0.45), []);

  const benchMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#4a5568", roughness: 0.8, metalness: 0.2 }),
    [],
  );

  const positions: [number, number, number][] = [
    [0, 0.23, -4],
    [-10, 0.23, 2],
    [8, 0.23, 10],
    [-16, 0.23, -8],
    [12, 0.23, -18],
    [0, 0.23, 10],
    [6, 0.23, -12],
  ];

  return (
    <group>
      {positions.map((pos, i) => (
        <group key={i} position={[pos[0], pos[1], pos[2]]}>
          <mesh geometry={seatGeom} material={benchMat} receiveShadow castShadow />
          <mesh geometry={legGeom} material={benchMat} position={[-0.8, -0.45, 0]} receiveShadow castShadow />
          <mesh geometry={legGeom} material={benchMat} position={[0.8, -0.45, 0]} receiveShadow castShadow />
        </group>
      ))}
    </group>
  );
}

function ParkingAreas({
  asphaltMat,
  markingMat,
  curbMat,
}: {
  asphaltMat: THREE.MeshStandardMaterial;
  markingMat: THREE.MeshBasicMaterial;
  curbMat: THREE.MeshStandardMaterial;
}) {
  const parkingSpaces: { pos: [number, number, number]; rot: [number, number, number]; spaces: number }[] = [
    { pos: [16, 0.01, -22], rot: [0, 0, 0], spaces: 6 },
    { pos: [-16, 0.01, -22], rot: [0, 0, 0], spaces: 4 },
    { pos: [18, 0.01, -10], rot: [0, Math.PI / 2, 0], spaces: 4 },
  ];

  const stallGeom = useMemo(() => new THREE.PlaneGeometry(2.5, 5), []);
  const stallMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const parkedCarMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1e3a8a",
        roughness: 0.4,
        metalness: 0.6,
      }),
    [],
  );
  const parkedCarMat2 = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0f766e",
        roughness: 0.4,
        metalness: 0.6,
      }),
    [],
  );

  const carGeom = useMemo(() => new THREE.BoxGeometry(4.2, 1.5, 1.6), []);

  return (
    <group>
      {parkingSpaces.map((ps, i) => {
        const parkingLength = ps.spaces * 2.8;

        return (
          <group
            key={`parking-${i}`}
            rotation={[0, ps.rot[1], 0]}
            position={[ps.pos[0], 0, ps.pos[2]]}
          >
            <mesh
              geometry={new THREE.PlaneGeometry(parkingLength + 1, 8)}
              material={asphaltMat}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.01, 0]}
              receiveShadow
            />
            <mesh
              geometry={new THREE.BoxGeometry(parkingLength + 1, 0.15, 0.2)}
              material={curbMat}
              position={[0, 0.075, 4]}
              receiveShadow
              castShadow
            />
            <mesh
              geometry={new THREE.BoxGeometry(parkingLength + 1, 0.15, 0.2)}
              material={curbMat}
              position={[0, 0.075, -4]}
              receiveShadow
              castShadow
            />
            {Array.from({ length: ps.spaces }).map((_, s) => {
              const slotX = -parkingLength / 2 + s * 2.8 + 1.4;
              const mat = s % 2 === 0 ? parkedCarMat : parkedCarMat2;
              if (s < ps.spaces - 1 && s % 3 === 0) {
                return (
                  <mesh
                    key={`car-${i}-${s}`}
                    geometry={carGeom}
                    material={mat}
                    position={[slotX, 0.75, 0]}
                    castShadow
                    receiveShadow
                  />
                );
              }
              return null;
            })}
          </group>
        );
      })}
    </group>
  );
}

function StreetLightPoles() {
  const poleGeom = useMemo(() => new THREE.CylinderGeometry(0.12, 0.12, 5, 8), []);
  const poleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2d3748", metalness: 0.5, roughness: 0.6 }),
    [],
  );

  const lightBulbMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffd24c",
        emissive: "#ffd24c",
        emissiveIntensity: 0.8,
        toneMapped: false,
      }),
    [],
  );

  const positions: [number, number, number][] = [
    [0, 0, -4],
    [0, 0, 8],
    [-10, 0, 4],
    [10, 0, 4],
    [-10, 0, -12],
    [10, 0, -12],
  ];

  return (
    <group>
      {positions.map((pos, i) => (
        <group key={i} position={[pos[0], 0, pos[2]]}>
          <mesh geometry={poleGeom} material={poleMat} position={[0, 2.5, 0]} castShadow />
          <mesh
            geometry={new THREE.SphereGeometry(0.15, 12, 12)}
            material={lightBulbMat}
            position={[0, 4.8, 0]}
          />
          <pointLight
            color="#ffd24c"
            intensity={0.5}
            distance={10}
            decay={2}
            position={[0, 4.8, 0]}
          />
        </group>
      ))}
    </group>
  );
}
