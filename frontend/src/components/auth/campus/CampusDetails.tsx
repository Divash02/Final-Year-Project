import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { BRAND_LOGO_SRC } from "../../common/BrandLogo";

let brandLogoPromise: Promise<HTMLImageElement> | null = null;

/**
 * Loads the institutional logo once and reuses it for every signage
 * texture, so the campus signage carries the same artwork as the UI.
 */
function loadBrandLogoImage(): Promise<HTMLImageElement> {
  if (!brandLogoPromise) {
    brandLogoPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Brand logo failed to load"));
      image.src = BRAND_LOGO_SRC;
    });
  }
  return brandLogoPromise;
}

const SIGNS = [
  { id: "admin", name: "ADMINISTRATION", pos: [-8, 0, 16] as [number, number, number] },
  { id: "academic", name: "ACADEMIC BUILDING", pos: [0, 0, 0] as [number, number, number] },
  { id: "library", name: "LIBRARY", pos: [-22, 0, 2] as [number, number, number] },
  { id: "student-center", name: "STUDENT CENTER", pos: [16, 0, -10] as [number, number, number] },
  { id: "gate", name: "MAIN GATE", pos: [0, 0, -30] as [number, number, number] },
];

function createSignTexture(
  text: string,
  logo?: HTMLImageElement | null,
  bgColor = "#1e293b",
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, 256, 128);

  const hasLogo = Boolean(logo && logo.complete && logo.naturalWidth > 0);
  const logoSize = 56;
  const logoX = 14;
  const logoY = (128 - logoSize) / 2;
  const textCenterX = hasLogo ? 170 : 128;
  const maxTextWidth = hasLogo ? 256 - logoX - logoSize - 22 : 236;

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let fontSize = 30;
  ctx.font = `bold ${fontSize}px monospace`;
  while (ctx.measureText(text).width > maxTextWidth && fontSize > 12) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px monospace`;
  }
  ctx.fillText(text, textCenterX, 50);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "14px monospace";
  ctx.fillText("COLLEGEOS UNIVERSITY", textCenterX, 92);

  if (hasLogo) {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(logoX - 4, logoY - 4, logoSize + 8, logoSize + 8);
    ctx.drawImage(logo!, logoX, logoY, logoSize, logoSize);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

function Signage() {
  const poleGeom = useMemo(() => new THREE.CylinderGeometry(0.08, 0.08, 3, 12), []);
  const signGeom = useMemo(() => new THREE.PlaneGeometry(3.2, 1.6), []);

  const poleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2d3748", metalness: 0.6, roughness: 0.5 }),
    [],
  );

  const [logo, setLogo] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;
    loadBrandLogoImage()
      .then((image) => {
        if (active) setLogo(image);
      })
      .catch(() => {
        // Signage falls back to text-only when the artwork cannot be loaded.
      });
    return () => {
      active = false;
    };
  }, []);

  const signTextures = useMemo(
    () => SIGNS.map((s) => createSignTexture(s.name, logo)),
    [logo],
  );

  const signMats = useMemo(
    () =>
      signTextures.map(
        (tex) =>
          new THREE.MeshStandardMaterial({
            map: tex,
            color: "#f8fafc",
            roughness: 0.6,
          }),
      ),
    [signTextures],
  );

  return (
    <group>
      {SIGNS.map((sign, i) => (
        <group key={sign.id} position={[sign.pos[0], 0, sign.pos[2]]}>
          <mesh geometry={poleGeom} material={poleMat} position={[0, 1.5, 0]} castShadow receiveShadow />
          <mesh geometry={signGeom} material={signMats[i]} position={[-2.8, 2.8, 0]} castShadow receiveShadow />
          <mesh geometry={poleGeom} material={poleMat} position={[-2.8, 4.2, 0]} />
        </group>
      ))}
    </group>
  );
}

function BoundaryAndGates() {
  const postGeom = useMemo(() => new THREE.CylinderGeometry(0.2, 0.2, 2.5, 12), []);
  const gateMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.7, metalness: 0.3 }),
    [],
  );

  const gatePositions: [number, number, number, number][] = [
    [0, 0, -30, 0],
    [0, 0, 28, 0],
    [-28, 0, 0, Math.PI / 2],
    [28, 0, 0, Math.PI / 2],
  ];

  const bollardPositions: [number, number, number][] = [
    [0, 0, -32],
    [-2, 0, -29],
    [2, 0, -29],
    [-26, 0, 0],
    [26, 0, 0],
    [0, 0, 26],
  ];

  const bollardGeom = useMemo(() => new THREE.CylinderGeometry(0.15, 0.15, 0.8, 12), []);

  const gateElements: React.ReactNode[] = [];

  gatePositions.forEach(([x, y, z, rot], i) => {
    gateElements.push(
      <mesh
        key={`gate-post-${i}-l`}
        geometry={postGeom}
        material={gateMat}
        position={[x - 2, 1.25, z]}
        rotation={[0, rot, 0]}
        castShadow
        receiveShadow
      />,
    );
    gateElements.push(
      <mesh
        key={`gate-post-${i}-r`}
        geometry={postGeom}
        material={gateMat}
        position={[x + 2, 1.25, z]}
        rotation={[0, rot, 0]}
        castShadow
        receiveShadow
      />,
    );

    gateElements.push(
      <mesh
        key={`gate-rail-${i}`}
        geometry={new THREE.BoxGeometry(4, 0.15, 0.15)}
        material={gateMat}
        position={[x, 2, z]}
        rotation={[0, rot, 0]}
        castShadow
        receiveShadow
      />,
    );
  });

  const bollardElements: React.ReactNode[] = [];
  bollardPositions.forEach((pos, i) => {
    bollardElements.push(
      <mesh
        key={`bollard-${i}`}
        geometry={bollardGeom}
        material={gateMat}
        position={[pos[0], 0.4, pos[2]]}
        castShadow
        receiveShadow
      />,
    );
  });

  return (
    <group>
      {gateElements}
      {bollardElements}
    </group>
  );
}

function StreetFurniture() {
  const benchMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.8, metalness: 0.2 }),
    [],
  );
  const trashMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.7, metalness: 0.3 }),
    [],
  );
  const bikeRackMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.6, metalness: 0.5 }),
    [],
  );

  const benchSeatGeom = useMemo(() => new THREE.BoxGeometry(1.8, 0.5, 0.5), []);
  const benchLegGeom = useMemo(() => new THREE.BoxGeometry(0.08, 0.45, 0.5), []);
  const trashGeom = useMemo(() => new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16), []);
  const trashLidGeom = useMemo(() => new THREE.CylinderGeometry(0.35, 0.35, 0.05, 16), []);
  const bikeBarGeom = useMemo(() => new THREE.TorusGeometry(0.8, 0.05, 8, 16), []);
  const bikePostGeom = useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), []);

  const benchPositions: [number, number, number][] = [
    [0, 0, -4],
    [-10, 0, 2],
    [8, 0, 10],
    [-16, 0, -8],
    [12, 0, -18],
    [0, 0, 10],
  ];

  const benchElements: React.ReactNode[] = [];
  benchPositions.forEach((pos, i) => {
    benchElements.push(
      <group key={`bench-${i}`} position={[pos[0], pos[1], pos[2]]}>
        <mesh geometry={benchSeatGeom} material={benchMat} position={[0, 0.4, 0]} castShadow receiveShadow />
        <mesh geometry={benchLegGeom} material={benchMat} position={[-0.9, 0.2, 0]} castShadow receiveShadow />
        <mesh geometry={benchLegGeom} material={benchMat} position={[0.9, 0.2, 0]} castShadow receiveShadow />
      </group>,
    );
  });

  const trashPositions: [number, number, number][] = [
    [-5, 0, -10],
    [5, 0, 6],
    [-14, 0, 10],
  ];
  const trashElements: React.ReactNode[] = [];
  trashPositions.forEach((pos, i) => {
    trashElements.push(
      <group key={`trash-${i}`} position={[pos[0], 0, pos[2]]}>
        <mesh geometry={trashGeom} material={trashMat} position={[0, 0.4, 0]} castShadow receiveShadow />
        <mesh geometry={trashLidGeom} material={trashMat} position={[0, 0.85, 0]} castShadow receiveShadow />
      </group>,
    );
  });

  const bikeRackPositions: [number, number, number][] = [
    [-8, 0, 8],
    [6, 0, -12],
  ];
  const bikeElements: React.ReactNode[] = [];
  bikeRackPositions.forEach((pos, i) => {
    bikeElements.push(
      <group key={`bikerack-${i}`} position={[pos[0], 0, pos[2]]}>
        <mesh geometry={bikePostGeom} material={bikeRackMat} position={[-0.5, 0.6, 0]} castShadow receiveShadow />
        <mesh geometry={bikeBarGeom} material={bikeRackMat} position={[-0.5, 0.8, 0]} castShadow receiveShadow />
        <mesh geometry={bikePostGeom} material={bikeRackMat} position={[0.5, 0.6, 0]} castShadow receiveShadow />
        <mesh geometry={bikeBarGeom} material={bikeRackMat} position={[0.5, 0.8, 0]} castShadow receiveShadow />
      </group>,
    );
  });

  return (
    <group>
      {benchElements}
      {trashElements}
      {bikeElements}
    </group>
  );
}

function Fountain() {
  const baseMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.9, metalness: 0.1 }),
    [],
  );
  const waterMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#0284c7",
        roughness: 0.05,
        metalness: 0.2,
        transmission: 0.5,
        transparent: true,
        opacity: 0.7,
        ior: 1.33,
        thickness: 0.3,
      }),
    [],
  );
  const sprayMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#bae6fd",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const sprayRef = useRef<THREE.Group>(null!);

  const timeRef = useRef(0);
  useFrame((_, delta) => {
    timeRef.current += delta;
    if (sprayRef.current) {
      sprayRef.current.children.forEach((child, i) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          const scale = 0.8 + Math.sin(timeRef.current * 3 + i) * 0.2;
          mesh.scale.set(scale, scale, scale);
        }
      });
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh
        geometry={new THREE.CylinderGeometry(5, 6, 1.2, 32)}
        material={baseMat}
        position={[0, 0.6, 0]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={new THREE.CylinderGeometry(4, 4.2, 0.6, 32)}
        material={baseMat}
        position={[0, 1.4, 0]}
        castShadow
      />
      <mesh
        geometry={new THREE.CylinderGeometry(3.5, 3.5, 0.3, 32)}
        material={waterMat}
        position={[0, 1.6, 0]}
        receiveShadow
      />
      <mesh
        geometry={new THREE.CylinderGeometry(0.5, 0.5, 1.2, 16)}
        material={baseMat}
        position={[0, 2.2, 0]}
        castShadow
      />

      <group ref={sprayRef} position={[0, 2.2, 0]}>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const x = Math.cos(angle) * 0.5;
          const z = Math.sin(angle) * 0.5;
          return (
            <mesh
              key={i}
              geometry={new THREE.ConeGeometry(0.15, 2.5, 6)}
              material={sprayMat}
              position={[x, 0, z]}
              rotation={[0, angle + Math.PI, Math.PI / 2]}
              renderOrder={10}
            />
          );
        })}
      </group>
    </group>
  );
}

export function CampusDetails() {
  return (
    <group>
      <Signage />
      <BoundaryAndGates />
      <StreetFurniture />
      <Fountain />
    </group>
  );
}

export default CampusDetails;
