import React, { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  CharacterType,
  CHARACTER_PRESETS,
  SKIN_COLORS,
  HAIR_COLORS,
  pickSeeded,
  seededRandom,
} from "./constants";

const TORSO_DEPTH = 0.09;

export interface PedestrianConfig {
  id: string;
  type: CharacterType;
  seed: number;
  height: number;
  walkSpeed: number;
  phase: number;
  startX: number;
  startZ: number;
  targetX: number;
  targetZ: number;
  direction: number;
  destinationBuilding?: string;
}

interface CharacterParts {
  torso: THREE.Object3D;
  head: THREE.Object3D;
  leftUpperArm: THREE.Object3D;
  rightUpperArm: THREE.Object3D;
  leftUpperLeg: THREE.Object3D;
  rightUpperLeg: THREE.Object3D;
  leftLowerLeg: THREE.Object3D;
  rightLowerLeg: THREE.Object3D;
  leftLowerArm: THREE.Object3D;
  rightLowerArm: THREE.Object3D;
  leftFoot: THREE.Object3D;
  rightFoot: THREE.Object3D;
}

interface CreatedGeometry {
  group: THREE.Group;
  parts: CharacterParts;
  torsoHeight: number;
  headSize: number;
}

function createCharacterGeometry(
  type: CharacterType,
  seed: number,
): CreatedGeometry {
  const preset = CHARACTER_PRESETS[type];
  const height = preset.height * (0.92 + seededRandom(seed) * 0.16);
  const build = 0.85 + seededRandom(seed * 3) * 0.3;

  const skinColor = pickSeeded(SKIN_COLORS, seed);
  const hairColor = pickSeeded(HAIR_COLORS, seed + 1);
  const shirtColor = pickSeeded(preset.shirtColors, seed + 2);
  const pantsColor = pickSeeded(preset.pantsColors, seed + 3);

  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.8 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.75 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.8 });

  const group = new THREE.Group();
  group.name = "character";

  const torsoW = 0.15 * build;
  const torsoH = 0.42 * (height / 1.72);
  const torsoDepth = TORSO_DEPTH;

  // Torso
  const torsoGeom = new THREE.BoxGeometry(torsoW, torsoH, torsoDepth);
  const torso = new THREE.Mesh(torsoGeom, shirtMat);
  torso.name = "torso";
  torso.position.y = torsoH / 2;
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Shirt collar overlay
  const collarGeom = new THREE.BoxGeometry(torsoW * 1.04, 0.12, torsoDepth * 1.04);
  const collar = new THREE.Mesh(collarGeom, shirtMat);
  collar.position.y = torsoH / 2 - 0.06;
  torso.add(collar);

  // Head
  const headSize = height * 0.045;
  const headGeom = new THREE.SphereGeometry(headSize, 12, 10);
  const head = new THREE.Mesh(headGeom, skinMat);
  head.name = "head";
  head.position.y = torsoH / 2 + headSize * 0.3;
  torso.add(head);

  // Hair
  const hairGeom = new THREE.SphereGeometry(headSize * 1.05, 10, 8);
  const hair = new THREE.Mesh(hairGeom, hairMat);
  hair.position.y = headSize * 0.15;
  head.add(hair);

  // Arm dimensions
  const armRadius = height * 0.032;
  const upperArmLen = 0.22 * (height / 1.72);
  const lowerArmLen = 0.2 * (height / 1.72);

  const upperArmGeom = new THREE.CylinderGeometry(armRadius * 1.1, armRadius, upperArmLen, 8);
  const lowerArmGeom = new THREE.CylinderGeometry(armRadius, armRadius * 0.85, lowerArmLen, 8);
  const handGeom = new THREE.SphereGeometry(armRadius * 1.3, 8, 8);

  // Left arm
  const leftShoulder = new THREE.Object3D();
  leftShoulder.name = "leftShoulder";
  leftShoulder.position.set(-torsoW / 2 - armRadius * 0.3, torsoH / 2 - 0.05, 0);
  torso.add(leftShoulder);

  const leftUpperArm = new THREE.Mesh(upperArmGeom, shirtMat);
  leftUpperArm.name = "leftUpperArm";
  leftUpperArm.position.y = -upperArmLen / 2;
  leftUpperArm.castShadow = true;
  leftShoulder.add(leftUpperArm);

  const leftLowerArm = new THREE.Mesh(lowerArmGeom, shirtMat);
  leftLowerArm.name = "leftLowerArm";
  leftLowerArm.position.y = -upperArmLen / 2;
  leftLowerArm.castShadow = true;
  leftUpperArm.add(leftLowerArm);

  const leftHand = new THREE.Mesh(handGeom, skinMat);
  leftHand.name = "leftHand";
  leftHand.position.y = -lowerArmLen / 2;
  leftLowerArm.add(leftHand);

  // Right arm
  const rightShoulder = new THREE.Object3D();
  rightShoulder.name = "rightShoulder";
  rightShoulder.position.set(torsoW / 2 + armRadius * 0.3, torsoH / 2 - 0.05, 0);
  torso.add(rightShoulder);

  const rightUpperArm = new THREE.Mesh(upperArmGeom, shirtMat);
  rightUpperArm.name = "rightUpperArm";
  rightUpperArm.position.y = -upperArmLen / 2;
  rightUpperArm.castShadow = true;
  rightShoulder.add(rightUpperArm);

  const rightLowerArm = new THREE.Mesh(lowerArmGeom, shirtMat);
  rightLowerArm.name = "rightLowerArm";
  rightLowerArm.position.y = -upperArmLen / 2;
  rightLowerArm.castShadow = true;
  rightUpperArm.add(rightLowerArm);

  const rightHand = new THREE.Mesh(handGeom, skinMat);
  rightHand.name = "rightHand";
  rightHand.position.y = -lowerArmLen / 2;
  rightLowerArm.add(rightHand);

  // Leg dimensions
  const legRadius = height * 0.037;
  const thighLen = 0.38 * (height / 1.72);
  const calfLen = 0.36 * (height / 1.72);

  const thighGeom = new THREE.CylinderGeometry(legRadius * 1.1, legRadius, thighLen, 8);
  const calfGeom = new THREE.CylinderGeometry(legRadius, legRadius * 0.85, calfLen, 8);
  const footGeom = new THREE.BoxGeometry(legRadius * 3.2, legRadius * 1.8, legRadius * 5);

  // Left leg
  const leftHip = new THREE.Object3D();
  leftHip.name = "leftHip";
  leftHip.position.set(-torsoW * 0.25, 0, 0);
  torso.add(leftHip);

  const leftThigh = new THREE.Mesh(thighGeom, pantsMat);
  leftThigh.name = "leftThigh";
  leftThigh.position.y = -thighLen / 2;
  leftThigh.castShadow = true;
  leftThigh.receiveShadow = true;
  leftHip.add(leftThigh);

  const leftCalf = new THREE.Mesh(calfGeom, pantsMat);
  leftCalf.name = "leftCalf";
  leftCalf.position.y = -thighLen / 2;
  leftCalf.castShadow = true;
  leftCalf.receiveShadow = true;
  leftThigh.add(leftCalf);

  const leftFoot = new THREE.Mesh(footGeom, shoeMat);
  leftFoot.name = "leftFoot";
  leftFoot.position.y = -thighLen / 2;
  leftFoot.position.z = legRadius * 2.5;
  leftCalf.add(leftFoot);

  // Right leg
  const rightHip = new THREE.Object3D();
  rightHip.name = "rightHip";
  rightHip.position.set(torsoW * 0.25, 0, 0);
  torso.add(rightHip);

  const rightThigh = new THREE.Mesh(thighGeom, pantsMat);
  rightThigh.name = "rightThigh";
  rightThigh.position.y = -thighLen / 2;
  rightThigh.castShadow = true;
  rightThigh.receiveShadow = true;
  rightHip.add(rightThigh);

  const rightCalf = new THREE.Mesh(calfGeom, pantsMat);
  rightCalf.name = "rightCalf";
  rightCalf.position.y = -thighLen / 2;
  rightCalf.castShadow = true;
  rightCalf.receiveShadow = true;
  rightThigh.add(rightCalf);

  const rightFoot = new THREE.Mesh(footGeom, shoeMat);
  rightFoot.name = "rightFoot";
  rightFoot.position.y = -thighLen / 2;
  rightFoot.position.z = legRadius * 2.5;
  rightCalf.add(rightFoot);

  // Accessories
  addAccessories(group, type, seed, preset, torso, head, height, torsoW, torsoH);

  const parts: CharacterParts = {
    torso,
    head,
    leftUpperArm,
    rightUpperArm,
    leftUpperLeg: leftThigh,
    rightUpperLeg: rightThigh,
    leftLowerLeg: leftCalf,
    rightLowerLeg: rightCalf,
    leftLowerArm,
    rightLowerArm,
    leftFoot,
    rightFoot,
  };

  return {
    group,
    parts,
    torsoHeight: torsoH,
    headSize,
  };
}

function addAccessories(
  _group: THREE.Group,
  type: CharacterType,
  seed: number,
  preset: (typeof CHARACTER_PRESETS)[CharacterType],
  torso: THREE.Object3D,
  head: THREE.Object3D,
  _height: number,
  torsoW: number,
  _torsoH: number,
): void {
  const accessory = pickSeeded(preset.accessories, seed + 7);

  switch (accessory) {
    case "backpack": {
      const bpGeom = new THREE.BoxGeometry(0.28, 0.35, 0.12);
      const bpMat = new THREE.MeshStandardMaterial({
        color: pickSeeded(["#1e3a8a", "#dc2626", "#0f766e", "#3730a3"], seed + 8),
        roughness: 0.6,
        metalness: 0.1,
      });
      const bp = new THREE.Mesh(bpGeom, bpMat);
      bp.position.set(0, -0.15, TORSO_DEPTH / 2 + 0.08);
      bp.castShadow = true;
      torso.add(bp);
      break;
    }
    case "bag": {
      const bagGeom = new THREE.TorusGeometry(0.12, 0.05, 6, 10);
      const bagMat = new THREE.MeshStandardMaterial({ color: "#7c3aed", roughness: 0.7 });
      const bag = new THREE.Mesh(bagGeom, bagMat);
      bag.position.set(torsoW / 2 + 0.08, 0.05, TORSO_DEPTH / 2 + 0.06);
      bag.rotation.z = Math.PI / 2;
      bag.castShadow = true;
      torso.add(bag);
      break;
    }
    case "briefcase": {
      const bcGeom = new THREE.BoxGeometry(0.22, 0.28, 0.1);
      const bcMat = new THREE.MeshStandardMaterial({ color: "#374151", roughness: 0.8, metalness: 0.2 });
      const bc = new THREE.Mesh(bcGeom, bcMat);
      bc.position.set(-torsoW / 2 - 0.1, 0.05, TORSO_DEPTH / 2 + 0.06);
      bc.castShadow = true;
      torso.add(bc);
      break;
    }
    case "vest": {
      const vestGeom = new THREE.BoxGeometry(torsoW * 1.1, 0.32, 0.1);
      const vestMat = new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.7 });
      const vest = new THREE.Mesh(vestGeom, vestMat);
      vest.position.set(0, 0, TORSO_DEPTH / 2 + 0.06);
      torso.add(vest);
      break;
    }
    case "cap": {
      const capMat = new THREE.MeshStandardMaterial({ color: "#1e293b" });
      const capBrimGeom = new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16);
      const capBrim = new THREE.Mesh(capBrimGeom, capMat);
      capBrim.position.y = head.position.y! + 0.055;
      head.add(capBrim);

      const capTopGeom = new THREE.CylinderGeometry(0.055, 0.055, 0.06, 16);
      const capTop = new THREE.Mesh(capTopGeom, capMat);
      capTop.position.y = 0.048;
      capTop.castShadow = true;
      capBrim.add(capTop);
      break;
    }
    case "toolbelt": {
      const beltGeom = new THREE.BoxGeometry(0.16, 0.05, 0.08);
      const beltMat = new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.7, metalness: 0.1 });
      const belt = new THREE.Mesh(beltGeom, beltMat);
      belt.position.set(0, -0.2, TORSO_DEPTH / 2 + 0.05);
      torso.add(belt);
      break;
    }
    default:
      break;
  }
}

const WALK_CYCLE_SPEED = 2.5;
const MOVE_SPEED_BASE = 0.8;
const ACCELERATION = 0.03;

export function WalkingPerson({
  config,
  active = true,
  enabled = true,
  bounds = 45,
}: {
  config: PedestrianConfig;
  active?: boolean;
  enabled?: boolean;
  bounds?: number;
}) {
  const groupRef = useRef<THREE.Group>(null!);

  const geometry = useMemo(
    () => createCharacterGeometry(config.type, config.seed),
    [config.type, config.seed],
  );

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(config.startX, 0, config.startZ);
      groupRef.current.rotation.y = config.direction;
    }
  }, [config]);

  const stateRef = useRef<{
    target: THREE.Vector3;
    targetDirection: number;
    state: "walking" | "idle" | "turning" | "arriving";
    idleTimer: number;
    currentSpeed: number;
    originalTorsoY: number;
    originalHeadY: number;
  }>({
    target: new THREE.Vector3(config.targetX, 0, config.targetZ),
    targetDirection: config.direction,
    state: "walking",
    idleTimer: 0,
    currentSpeed: config.walkSpeed,
    originalTorsoY: 0,
    originalHeadY: 0,
  });

  // Store original positions for animation deltas
  useEffect(() => {
    const torso = groupRef.current?.getObjectByName("torso");
    const head = groupRef.current?.getObjectByName("head");
    if (torso) stateRef.current.originalTorsoY = torso.position.y;
    if (head) stateRef.current.originalHeadY = head.position.y;
  }, []);

  useFrame(({ clock }) => {
    if (!enabled || !active || !groupRef.current) return;

    const grp = groupRef.current;
    const parts = geometry.parts;
    const s = stateRef.current;

    const elapsed = clock.elapsedTime;
    const cycle = elapsed * config.walkSpeed * WALK_CYCLE_SPEED + config.phase;

    const sinT = Math.sin(cycle);
    const cosT = Math.cos(cycle);
    const absSinT = Math.abs(sinT);

    const isMoving = s.state === "walking" || s.state === "turning";
    const animSpeed = isMoving ? config.walkSpeed * 0.6 : 0.2;

    // Legs — opposite phases, natural swing
    const legAngle = sinT * 0.28 * animSpeed;
    parts.leftUpperLeg.rotation.x = legAngle;
    parts.rightUpperLeg.rotation.x = -legAngle;
    parts.leftUpperLeg.rotation.z = sinT * 0.03 * animSpeed;
    parts.rightUpperLeg.rotation.z = -sinT * 0.03 * animSpeed;

    // Knee bends — lift foot during swing phase
    const kneeBend = absSinT * 0.3 * animSpeed;
    parts.leftLowerLeg.rotation.x = kneeBend;
    parts.rightLowerLeg.rotation.x = kneeBend;
    parts.leftLowerLeg.rotation.z = sinT * 0.02;
    parts.rightLowerLeg.rotation.z = -sinT * 0.02;

    // Arms — opposite to legs
    const armAngle = sinT * 0.35 * animSpeed;
    parts.leftUpperArm.rotation.x = -armAngle;
    parts.rightUpperArm.rotation.x = armAngle;
    parts.leftUpperArm.rotation.z = sinT * 0.04 * animSpeed;
    parts.rightUpperArm.rotation.z = -sinT * 0.04 * animSpeed;

    // Elbows
    parts.leftLowerArm.rotation.x = absSinT * 0.15;
    parts.rightLowerArm.rotation.x = absSinT * 0.15;

    // Body
    parts.torso.rotation.z = sinT * 0.02;
    parts.torso.rotation.x = 0.015;
    parts.torso.position.y = s.originalTorsoY + Math.sin(cycle * 2) * 0.01;

    // Head
    parts.head.rotation.y = sinT * 0.03;
    parts.head.position.y = s.originalHeadY + Math.sin(cycle * 2) * 0.006;
    parts.head.rotation.x = sinT * 0.015;

    // Feet — subtle toe-off
    parts.leftFoot.rotation.x = -absSinT * 0.08;
    parts.rightFoot.rotation.x = -absSinT * 0.08;

    // Movement logic
    if (s.state === "idle") {
      s.idleTimer -= 0.016;
      parts.torso.rotation.z = Math.sin(elapsed * 0.7) * 0.01;
      parts.head.rotation.y = Math.sin(elapsed * 0.5) * 0.08;

      if (s.idleTimer <= 0) {
        s.state = "turning";
        s.targetDirection = config.direction + (Math.random() - 0.5) * Math.PI;
        s.idleTimer = 4 + Math.random() * 8;
        s.currentSpeed = 0;
      }
    } else if (s.state === "turning") {
      let diff = s.targetDirection - grp.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      grp.rotation.y += diff * 0.08;

      if (Math.abs(diff) < 0.1) {
        s.state = "walking";
        s.currentSpeed = config.walkSpeed;
        // Pick a new target based on new direction
        const dist = 3 + Math.random() * 5;
        s.target.set(
          grp.position.x + Math.sin(grp.rotation.y) * dist,
          0,
          grp.position.z + Math.cos(grp.rotation.y) * dist,
        );
        s.targetDirection = grp.rotation.y;
      }
    } else if (s.state === "walking" || s.state === "arriving") {
      const dx = s.target.x - grp.position.x;
      const dz = s.target.z - grp.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.5) {
        const angle = Math.atan2(dx, dz);
        let diff = angle - grp.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        grp.rotation.y += diff * 0.06;

        // Slow down when approaching target
        const approachFactor = Math.min(1, dist / 4);
        const targetSpeed = config.walkSpeed * approachFactor * 0.6;
        s.currentSpeed += (targetSpeed - s.currentSpeed) * ACCELERATION;

        const moveX = (dx / dist) * s.currentSpeed * 0.016;
        const moveZ = (dz / dist) * s.currentSpeed * 0.016;
        grp.position.x += moveX;
        grp.position.z += moveZ;

        // Keep within bounds
        if (Math.abs(grp.position.x) > bounds) {
          s.state = "turning";
          s.targetDirection = grp.rotation.y + Math.PI - (Math.random() - 0.5) * 0.5;
        }
        if (Math.abs(grp.position.z) > bounds) {
          s.state = "turning";
          s.targetDirection = grp.rotation.y + Math.PI - (Math.random() - 0.5) * 0.5;
        }
      } else {
        s.state = "idle";
        s.idleTimer = 2 + Math.random() * 5;
        s.currentSpeed = 0;
        // Pick a new random target
        s.target.set(
          (Math.random() - 0.5) * bounds,
          0,
          (Math.random() - 0.5) * bounds,
        );
      }
    }
  });

  return (
    <primitive ref={groupRef} object={geometry.group} />
  );
}
