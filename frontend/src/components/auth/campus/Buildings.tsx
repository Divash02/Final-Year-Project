import React, { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { BUILDINGS } from "./constants";
import type { BuildingDef } from "./constants";
import { getTextures } from "./textures";

interface BuildingMaterials {
  brick: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  concrete: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  emissive: THREE.MeshBasicMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  windowFrame: THREE.MeshStandardMaterial;
}

function useBuildingMaterials(): BuildingMaterials {
  const textures = useMemo(() => getTextures(), []);

  return useMemo<BuildingMaterials>(() => {
    const brick = new THREE.MeshStandardMaterial({
      map: textures.brick,
      normalMap: textures.brickNormal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.7,
      metalness: 0.1,
      color: "#c96532",
      aoMapIntensity: 0.8,
    });

    const glass = new THREE.MeshPhysicalMaterial({
      color: "#8ecae6",
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.5,
      clearcoat: 0.3,
      clearcoatRoughness: 0.1,
      envMapIntensity: 0.6,
      depthWrite: false,
      reflectivity: 0.9,
      ior: 1.52,
    });

    const concrete = new THREE.MeshStandardMaterial({
      map: textures.concrete,
      normalMap: textures.concreteNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.85,
      metalness: 0.05,
      color: "#b0b8c4",
      aoMapIntensity: 0.7,
    });

    const stone = new THREE.MeshStandardMaterial({
      map: textures.concrete,
      normalMap: textures.concreteNormal,
      normalScale: new THREE.Vector2(0.3, 0.3),
      color: "#8a8f99",
      roughness: 0.85,
      metalness: 0.05,
      aoMapIntensity: 0.8,
    });

    const metal = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.7,
      color: "#4a6fa5",
      envMapIntensity: 0.8,
    });

    const darkMetal = new THREE.MeshStandardMaterial({
      color: "#1a202c",
      roughness: 0.85,
      metalness: 0.3,
      envMapIntensity: 0.6,
    });

    const white = new THREE.MeshStandardMaterial({
      color: "#f1f5f9",
      roughness: 0.6,
      metalness: 0.05,
      envMapIntensity: 0.4,
    });

    const windowFrame = new THREE.MeshStandardMaterial({
      color: "#e2e8f0",
      roughness: 0.45,
      metalness: 0.5,
      envMapIntensity: 0.7,
    });

    const emissive = new THREE.MeshBasicMaterial({
      color: "#ffd870",
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    });

    return { brick, glass, concrete, stone, metal, emissive, darkMetal, white, windowFrame };
  }, [textures]);
}

const WINDOW_FRAME_GEOMETRY = new THREE.BoxGeometry(0.7, 0.95, 0.04);
const WINDOW_GLASS_GEOMETRY = new THREE.PlaneGeometry(0.5, 0.75);
const DOOR_GEOMETRY = new THREE.PlaneGeometry(2.4, 3.2);
const SMALL_DOOR_GEOMETRY = new THREE.PlaneGeometry(1.2, 2.0);
const FRAME_BORDER = 0.08;

function createWindowWithFrame(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  normal: THREE.Vector3,
  materials: BuildingMaterials,
  isLit: boolean,
): void {
  const frame = new THREE.Mesh(WINDOW_FRAME_GEOMETRY, materials.windowFrame);
  frame.position.set(x, y, z);
  frame.lookAt(x + normal.x, y + normal.y, z + normal.z);
  parent.add(frame);

  const glass = new THREE.Mesh(
    WINDOW_GLASS_GEOMETRY,
    isLit ? materials.emissive : materials.glass,
  );
  glass.position.set(x, y, z + (normal.z !== 0 ? 0.021 : 0));
  glass.lookAt(x + normal.x, y + normal.y, z + normal.z);
  glass.userData.isWindow = true;
  glass.userData.isLit = isLit;
  glass.userData.originalMaterial = materials.glass;
  parent.add(glass);
}

function createWindowGrid(
  parent: THREE.Group,
  facadeWidth: number,
  facadeHeight: number,
  stories: number,
  litFraction: number,
  materials: BuildingMaterials,
  normal: THREE.Vector3,
  offsetZ: number,
): void {
  const windowsPerStory = Math.max(3, Math.floor(facadeWidth / 2.2));
  const windowAreaW = facadeWidth / windowsPerStory;
  const windowAreaH = facadeHeight / stories;

  for (let s = 0; s < stories; s++) {
    const rowY = -facadeHeight / 2 + (s + 0.5) * windowAreaH;
    for (let w = 0; w < windowsPerStory; w++) {
      const colX = -facadeWidth / 2 + (w + 0.5) * windowAreaW;

      if (Math.random() < 0.06) continue;

      const isLit = Math.random() < litFraction;
      createWindowWithFrame(parent, colX, rowY + windowH() / 2, offsetZ, normal, materials, isLit);
    }
  }
}

function windowH(): number {
  return 0.75;
}

function createFacadeWindows(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  stories: number,
  litFraction: number,
  materials: BuildingMaterials,
): void {
  createWindowGrid(group, w, h, stories, litFraction, materials, new THREE.Vector3(0, 0, 1), d / 2 + 0.01);
  createWindowGrid(group, w, h, stories, litFraction, materials, new THREE.Vector3(0, 0, -1), -(d / 2 + 0.01));
  createWindowGrid(group, d, h, stories, litFraction, materials, new THREE.Vector3(1, 0, 0), w / 2 + 0.01);
  createWindowGrid(group, d, h, stories, litFraction, materials, new THREE.Vector3(-1, 0, 0), -(w / 2 + 0.01));
}

function createDoors(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  materials: BuildingMaterials,
  entranceSide: string,
): void {
  const doorMat = new THREE.MeshStandardMaterial({
    color: "#3a2a1a",
    roughness: 0.7,
    metalness: 0.15,
  });

  const mainDoor = new THREE.Mesh(DOOR_GEOMETRY, doorMat);
  const mainDoorOffset =
    entranceSide === "north"
      ? d / 2 + 0.02
      : entranceSide === "south"
        ? -(d / 2 + 0.02)
        : d / 2 + 0.02;

  mainDoor.position.set(0, 1.6, mainDoorOffset);
  if (entranceSide === "south") mainDoor.rotation.y = Math.PI;
  group.add(mainDoor);

  const door2 = new THREE.Mesh(SMALL_DOOR_GEOMETRY, doorMat);
  door2.position.set(2.8, 1.0, mainDoorOffset);
  if (entranceSide === "south") door2.rotation.y = Math.PI;
  group.add(door2);

  const door3 = new THREE.Mesh(SMALL_DOOR_GEOMETRY, doorMat);
  door3.position.set(-2.8, 1.0, mainDoorOffset);
  if (entranceSide === "south") door3.rotation.y = Math.PI;
  group.add(door3);

  const stairsGeom = new THREE.BoxGeometry(6, 0.15, 1.2);
  const stairs = new THREE.Mesh(stairsGeom, materials.darkMetal);
  stairs.position.set(0, 0.075, mainDoorOffset + (entranceSide === "south" ? -1.2 : 1.2));
  group.add(stairs);

  for (const door of [mainDoor, door2, door3]) {
    door.castShadow = true;
    door.receiveShadow = true;
  }
}

function addHorizontalBands(group: THREE.Group, w: number, h: number, d: number, stories: number): void {
  const bandMat = new THREE.MeshStandardMaterial({
    color: "#e2e8f0",
    roughness: 0.6,
    metalness: 0.05,
  });
  const bandGeom = new THREE.BoxGeometry(w + 0.05, 0.12, d + 0.05);

  for (let s = 1; s < stories; s++) {
    const bandY = (h / stories) * s + 0.06;
    const band = new THREE.Mesh(bandGeom, bandMat);
    band.position.y = bandY;
    group.add(band);
  }
}

function addRoofDetails(group: THREE.Group, w: number, h: number, d: number, roof: string): void {
  if (roof === "flat") {
    const parapetMat = new THREE.MeshStandardMaterial({
      color: "#475569",
      roughness: 0.7,
      metalness: 0.2,
    });
    const parapetGeom = new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4);
    const parapet = new THREE.Mesh(parapetGeom, parapetMat);
    parapet.position.y = h + 0.2;
    parapet.castShadow = true;
    group.add(parapet);

    if (Math.random() < 0.7) {
      const acMat = new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.6, metalness: 0.3 });
      const acGeom = new THREE.BoxGeometry(1.2, 0.6, 0.8);
      const ac1 = new THREE.Mesh(acGeom, acMat);
      ac1.position.set(w * 0.25, h + 0.6, d * 0.2);
      ac1.castShadow = true;
      group.add(ac1);

      const ac2 = new THREE.Mesh(acGeom, acMat);
      ac2.position.set(-w * 0.25, h + 0.6, -d * 0.2);
      ac2.castShadow = true;
      group.add(ac2);
    }
  } else if (roof === "gable") {
    const capGeom = new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2);
    const cap = new THREE.Mesh(capGeom, new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.8 }));
    cap.position.y = h + 0.15;
    group.add(cap);
  }
}

function addSpecialFeatures(
  group: THREE.Group,
  def: BuildingDef,
  materials: BuildingMaterials,
  special: string,
): void {
  const [w, h, d] = def.size;

  switch (special) {
    case "atrium": {
      const frameMat = new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.4, metalness: 0.5 });
      const frameGeom = new THREE.TorusGeometry(2, 0.15, 8, 16);
      const frame = new THREE.Mesh(frameGeom, frameMat);
      frame.position.y = h * 0.8;
      frame.rotation.x = Math.PI / 2;
      group.add(frame);

      const voidMat = new THREE.MeshStandardMaterial({
        color: "#0f172a",
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      });
      const voidGeom = new THREE.BoxGeometry(w * 0.35, h * 0.5, d * 0.3);
      const voidMesh = new THREE.Mesh(voidGeom, voidMat);
      voidMesh.position.y = h * 0.55;
      voidMesh.renderOrder = 2;
      group.add(voidMesh);
      break;
    }

    case "columns": {
      const columnMat = new THREE.MeshStandardMaterial({
        color: "#f8fafc",
        roughness: 0.5,
        metalness: 0.05,
      });
      const columnGeom = new THREE.CylinderGeometry(0.4, 0.45, h + 2, 16);

      const columnPositions: [number, number, number][] = [
        [-w / 2 + 2, h / 2 + 0.3, d / 2 + 0.2],
        [w / 2 - 2, h / 2 + 0.3, d / 2 + 0.2],
        [-w / 2 + 2, h / 2 + 0.3, -d / 2 - 0.2],
        [w / 2 - 2, h / 2 + 0.3, -d / 2 - 0.2],
      ];

      columnPositions.forEach((pos) => {
        const column = new THREE.Mesh(columnGeom, columnMat);
        column.position.set(pos[0], pos[1], pos[2]);
        column.castShadow = true;
        column.receiveShadow = true;
        group.add(column);
      });

      const canopyMat = materials.darkMetal;
      const canopyGeom = new THREE.BoxGeometry(w - 6, 0.6, 1.5);
      const canopy = new THREE.Mesh(canopyGeom, canopyMat);
      canopy.position.y = h + 1.5;
      canopy.castShadow = true;
      group.add(canopy);
      break;
    }

    case "patio": {
      const awningMat = new THREE.MeshStandardMaterial({
        color: "#0284c7",
        roughness: 0.4,
        metalness: 0.2,
      });
      const awningGeom = new THREE.BoxGeometry(w, 0.25, 3);
      const awning = new THREE.Mesh(awningGeom, awningMat);
      awning.position.y = h + 0.5;
      awning.position.z = d / 2 + 1.5;
      awning.castShadow = true;
      group.add(awning);

      const postMat = materials.darkMetal;
      const postGeom = new THREE.CylinderGeometry(0.15, 0.15, 2.5, 8);
      const postPositions: [number, number, number][] = [
        [w / 2 - 1, 2, d / 2 + 1.5],
        [-w / 2 + 1, 2, d / 2 + 1.5],
        [w / 2 - 1, 2, d / 2 + 3],
        [-w / 2 + 1, 2, d / 2 + 3],
      ];
      postPositions.forEach((pos) => {
        const post = new THREE.Mesh(postGeom, postMat);
        post.position.set(pos[0], pos[1], pos[2]);
        post.castShadow = true;
        group.add(post);
      });
      break;
    }

    case "balconies": {
      const balconyMat = new THREE.MeshStandardMaterial({
        color: "#475569",
        metalness: 0.5,
        roughness: 0.35,
      });
      const railGeom = new THREE.CylinderGeometry(0.04, 0.04, 2, 6);
      const floorGeom = new THREE.BoxGeometry(3, 0.12, 1.5);

      for (let s = 1; s < def.stories; s++) {
        const floorY = (h / def.stories) * s + 0.7;
        for (const side of [-1, 1]) {
          const balcony = new THREE.Group();
          const floor = new THREE.Mesh(floorGeom, balconyMat);
          floor.position.y = -0.06;
          floor.castShadow = true;
          balcony.add(floor);

          for (let j = 0; j < 4; j++) {
            const rail = new THREE.Mesh(railGeom, balconyMat);
            rail.position.set(-1.0 + j * 0.66, 0.35, 0);
            rail.rotation.y = Math.PI / 6;
            balcony.add(rail);
          }

          balcony.position.set(side * (w / 2 + 0.1), floorY, 0);
          group.add(balcony);
        }
      }
      break;
    }

    case "garage": {
      const garageMat = new THREE.MeshStandardMaterial({
        color: "#1e293b",
        roughness: 0.9,
        metalness: 0.2,
      });
      const slots = Math.floor(w / 3);

      for (let i = 0; i < slots; i++) {
        const slotGeom = new THREE.BoxGeometry(2.8, 2.8, 0.1);
        const slot = new THREE.Mesh(slotGeom, garageMat);
        const x = -w / 2 + 1.4 + i * 3.2;
        const y = h * 0.4;
        slot.position.set(x, y, d / 2 + 0.05);

        if (Math.random() < 0.3) {
          const lightMat = garageMat.clone();
          lightMat.emissive = new THREE.Color(0x333333);
          lightMat.emissiveIntensity = 0.4;
          slot.material = lightMat;
        }

        group.add(slot);
      }
      break;
    }

    case "arch": {
      const archMat = new THREE.MeshStandardMaterial({
        color: "#334155",
        roughness: 0.6,
        metalness: 0.4,
      });
      const archGeom = new THREE.TorusGeometry(4, 0.4, 8, 16, Math.PI);
      const arch = new THREE.Mesh(archGeom, archMat);
      arch.position.y = h * 0.7;
      arch.rotation.z = Math.PI / 2;
      arch.castShadow = true;
      group.add(arch);

      const pillarGeom = new THREE.BoxGeometry(1, h * 0.8, 1);
      const leftPillar = new THREE.Mesh(pillarGeom, archMat);
      leftPillar.position.set(-4, h * 0.4, 0);
      leftPillar.castShadow = true;
      group.add(leftPillar);

      const rightPillar = new THREE.Mesh(pillarGeom, archMat);
      rightPillar.position.set(4, h * 0.4, 0);
      rightPillar.castShadow = true;
      group.add(rightPillar);

      const capGeom = new THREE.BoxGeometry(9, 0.5, 1.5);
      const cap = new THREE.Mesh(capGeom, archMat);
      cap.position.y = h + 0.25;
      cap.castShadow = true;
      group.add(cap);
      break;
    }

    default:
      break;
  }
}

export function createBuilding(
  def: BuildingDef,
  materials: BuildingMaterials,
  groupRef?: THREE.Group,
): THREE.Group {
  const { size, material: matType, stories, windowLitFraction, entrance, special } = def;
  const [w, h, d] = size;

  const group = groupRef ?? new THREE.Group();
  group.userData.name = def.name;
  group.userData.buildingId = def.id;

  const baseMat =
    materials[matType as keyof BuildingMaterials] || materials.concrete;

  const mainGeom = new THREE.BoxGeometry(w, h, d);
  const shell = new THREE.Mesh(mainGeom, baseMat);
  shell.position.y = h / 2;
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  createFacadeWindows(group, w, h, d, stories, windowLitFraction, materials);

  createDoors(group, w, h, d, materials, entrance.side);

  addHorizontalBands(group, w, h, d, stories);
  addRoofDetails(group, w, h, d, def.roof);
  addBuildingDetails(group, def, materials);
  if (special) addSpecialFeatures(group, def, materials, special);

  return group;
}

function addBuildingDetails(
  group: THREE.Group,
  def: BuildingDef,
  materials: BuildingMaterials,
): void {
  const [w, h, d] = def.size;

  const capGeom = new THREE.BoxGeometry(w + 0.2, 0.35, d + 0.2);
  const cap = new THREE.Mesh(capGeom, materials.darkMetal);
  cap.position.y = h + 0.175;
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);

  const trimGeom = new THREE.BoxGeometry(0.12, h, 0.12);
  const corners: [number, number, number][] = [
    [-w / 2, h / 2, -d / 2],
    [w / 2, h / 2, -d / 2],
    [-w / 2, h / 2, d / 2],
    [w / 2, h / 2, d / 2],
  ];

  corners.forEach((pos) => {
    const corner = new THREE.Mesh(trimGeom, materials.white);
    corner.position.set(pos[0], pos[1], pos[2]);
    corner.castShadow = true;
    group.add(corner);
  });

  if (def.stories >= 3) {
    const railingMat = new THREE.MeshStandardMaterial({
      color: "#334155",
      metalness: 0.5,
      roughness: 0.4,
    });
    const railingGeom = new THREE.BoxGeometry(w - 2, 0.08, 0.08);

    for (let s = 1; s < def.stories; s++) {
      const railY = (h / def.stories) * s + 0.8;
      const railing = new THREE.Mesh(railingGeom, railingMat);
      railing.position.set(0, railY, d / 2 + 0.04);
      group.add(railing);

      const railing2 = railing.clone();
      railing2.position.set(0, railY, -d / 2 - 0.04);
      group.add(railing2);
    }
  }
}

export function Building({
  def,
  timeOfDay,
  windowLightsOn,
}: {
  def: BuildingDef;
  timeOfDay: "day" | "evening" | "night";
  windowLightsOn: boolean;
}) {
  const materials = useBuildingMaterials();
  const groupRef = useRef<THREE.Group>(null!);

  const geometry = useMemo(() => {
    const grp = new THREE.Group();
    grp.userData.name = def.name;
    grp.userData.buildingId = def.id;
    grp.position.set(def.position[0], def.position[1], def.position[2]);
    createBuilding(def, materials, grp);
    return grp;
  }, [def, materials]);

  useEffect(() => {
    const grp = groupRef.current;
    if (!grp) return;

    const isDay = timeOfDay === "day";
    const isNight = timeOfDay === "night";
    const isEvening = timeOfDay === "evening";

     grp.traverse((child) => {
       if ((child as any).userData?.isWindow) {
         const isLit = (child as any).userData.isLit;
         if (isDay) {
           (child as THREE.Mesh).material = (child as any).userData.originalMaterial;
         } else if (isEvening && isLit && windowLightsOn) {
           const litMat = materials.emissive.clone();
           litMat.opacity = 0.4 + Math.random() * 0.1;
           (child as THREE.Mesh).material = litMat;
         } else if (isNight && isLit && windowLightsOn) {
           const litMat = materials.emissive.clone();
           litMat.opacity = 0.6 + Math.random() * 0.25;
           (child as THREE.Mesh).material = litMat;
         }
       }
     });
  }, [timeOfDay, windowLightsOn, materials]);

  return <primitive ref={groupRef} object={geometry} />;
}

export function Buildings({
  timeOfDay,
  windowLightsOn,
}: {
  timeOfDay: "day" | "evening" | "night";
  windowLightsOn: boolean;
}) {
  return (
    <group>
      {BUILDINGS.map((building) => (
        <Building
          key={building.id}
          def={building}
          timeOfDay={timeOfDay}
          windowLightsOn={windowLightsOn}
        />
      ))}
    </group>
  );
}

export default Buildings;
