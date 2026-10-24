import React, { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  DELIVERY_WAIT_DURATION,
  DELIVERY_CYCLE,
  Waypoint,
} from "./constants";

export interface VehicleConfig {
  id: string;
  type: "car" | "shuttle" | "delivery";
  color: string;
  path: THREE.CatmullRomCurve3;
  speed: number;
  progress: number;
  stops?: { t: number; duration: number }[];
  spawnTime: number;
}

const WHEEL_RADIUS = 0.35;
const WHEEL_WIDTH = 0.25;

const WHEEL_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#111111",
  roughness: 0.4,
  metalness: 0.8,
});

const HEADLIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#ffffff",
  emissive: "#ffffff",
  emissiveIntensity: 0.8,
  toneMapped: false,
});

const BRAKE_LIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#ff0000",
  emissive: "#ff0000",
  emissiveIntensity: 0.6,
  toneMapped: false,
});

const CHROME_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#c0c0c0",
  roughness: 0.1,
  metalness: 0.9,
  envMapIntensity: 0.9,
});

function createWheel(): THREE.Group {
  const group = new THREE.Group();
  group.name = "wheel";

  const rimGeom = new THREE.TorusGeometry(WHEEL_RADIUS, WHEEL_WIDTH / 2, 8, 16);
  const rim = new THREE.Mesh(rimGeom, WHEEL_MATERIAL);
  rim.rotation.y = Math.PI / 2;
  rim.castShadow = true;
  rim.receiveShadow = true;
  group.add(rim);

  const spokeGeom = new THREE.CylinderGeometry(WHEEL_RADIUS * 0.3, WHEEL_RADIUS * 0.3, WHEEL_WIDTH * 0.3, 8);
  const spoke = new THREE.Mesh(spokeGeom, WHEEL_MATERIAL);
  spoke.rotation.y = Math.PI / 2;
  spoke.castShadow = true;
  group.add(spoke);

  return group;
}

function createCarBody(color: string): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.7,
    envMapIntensity: 0.9,
  });

  const blackMat = new THREE.MeshStandardMaterial({
    color: "#111111",
    roughness: 0.15,
    metalness: 0.8,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: "#87ceeb",
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.35,
    ior: 1.52,
    reflectivity: 0.9,
  });

  const bodyGeom = new THREE.BoxGeometry(4.4, 1.2, 1.6);
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = 0.7;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const rearGeom = new THREE.BoxGeometry(4.4, 0.8, 1.6);
  const rear = new THREE.Mesh(rearGeom, bodyMat);
  rear.position.set(0, 1.1, 0);
  rear.castShadow = true;
  group.add(rear);

  const trunkGeom = new THREE.BoxGeometry(1.4, 0.4, 1.6);
  const trunk = new THREE.Mesh(trunkGeom, bodyMat);
  trunk.position.set(2.2, 0.4, 0);
  trunk.castShadow = true;
  group.add(trunk);

  const cabinGeom = new THREE.BoxGeometry(2.2, 0.9, 1.4);
  const cabin = new THREE.Mesh(cabinGeom, bodyMat);
  cabin.position.set(-0.5, 1.65, 0);
  cabin.castShadow = true;
  group.add(cabin);

  const roofGeom = new THREE.BoxGeometry(2.2, 0.1, 1.4);
  const roof = new THREE.Mesh(roofGeom, bodyMat);
  roof.position.set(-0.5, 2.1, 0);
  group.add(roof);

  const windshieldGeom = new THREE.PlaneGeometry(3.2, 0.7);
  const windshield = new THREE.Mesh(windshieldGeom, glassMat);
  windshield.position.set(-0.3, 1.95, 0);
  windshield.rotation.y = Math.PI / 2;
  windshield.renderOrder = 2;
  group.add(windshield);

  const sideWindowGeom = new THREE.PlaneGeometry(1.8, 0.8);
  const leftWindow = new THREE.Mesh(sideWindowGeom, glassMat);
  leftWindow.position.set(-0.5, 1.7, 0.8);
  leftWindow.rotation.y = Math.PI / 2;
  leftWindow.renderOrder = 2;
  group.add(leftWindow);

  const rightWindow = leftWindow.clone();
  rightWindow.position.set(-0.5, 1.7, -0.8);
  rightWindow.rotation.y = -Math.PI / 2;
  group.add(rightWindow);

  const wheelPositions: [number, number, number, number][] = [
    [-1.55, WHEEL_RADIUS, 0.85, 0],
    [-1.55, WHEEL_RADIUS, -0.85, 0],
    [1.5, WHEEL_RADIUS, 0.85, 0],
    [1.5, WHEEL_RADIUS, -0.85, 0],
  ];

  wheelPositions.forEach(([x, y, z, rot]) => {
    const wheel = createWheel();
    wheel.position.set(x, y, z);
    group.add(wheel);
  });

  const headlightGeom = new THREE.SphereGeometry(0.12, 12, 12);
  const hl1 = new THREE.Mesh(headlightGeom, HEADLIGHT_MATERIAL);
  hl1.position.set(2.2, 0.85, 0.45);
  group.add(hl1);

  const hl2 = new THREE.Mesh(headlightGeom, HEADLIGHT_MATERIAL);
  hl2.position.set(2.2, 0.85, -0.45);
  group.add(hl2);

  const brakeLightGeom = new THREE.SphereGeometry(0.08, 10, 10);
  const tl1 = new THREE.Mesh(brakeLightGeom, BRAKE_LIGHT_MATERIAL);
  tl1.position.set(-2.2, 0.9, 0.45);
  group.add(tl1);

  const tl2 = new THREE.Mesh(brakeLightGeom, BRAKE_LIGHT_MATERIAL);
  tl2.position.set(-2.2, 0.9, -0.45);
  group.add(tl2);

  const tl3 = new THREE.Mesh(brakeLightGeom, BRAKE_LIGHT_MATERIAL);
  tl3.position.set(-2.2, 1.25, 0);
  group.add(tl3);

  const grilleGeom = new THREE.PlaneGeometry(1.8, 0.4);
  const grille = new THREE.Mesh(grilleGeom, CHROME_MATERIAL);
  grille.position.set(2.2, 0.8, 0);
  grille.rotation.y = Math.PI / 2;
  group.add(grille);

  const mirrorGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);
  const mirror1 = new THREE.Mesh(mirrorGeom, CHROME_MATERIAL);
  mirror1.position.set(0.2, 1.6, 0.85);
  mirror1.rotation.z = Math.PI / 10;
  group.add(mirror1);

  const mirror2 = mirror1.clone();
  mirror2.position.set(0.2, 1.6, -0.85);
  mirror2.rotation.z = -Math.PI / 10;
  group.add(mirror2);

  const licensePlateGeom = new THREE.PlaneGeometry(0.35, 0.08);
  const licensePlateMat = new THREE.MeshStandardMaterial({ color: "#ffff00", roughness: 0.5 });
  const plate1 = new THREE.Mesh(licensePlateGeom, licensePlateMat);
  plate1.position.set(2.15, 0.5, 0);
  plate1.rotation.y = Math.PI / 2;
  group.add(plate1);

  const plate2 = new THREE.Mesh(licensePlateGeom, licensePlateMat);
  plate2.position.set(-2.15, 0.5, 0);
  plate2.rotation.y = Math.PI / 2;
  group.add(plate2);

  const bumperFrontGeom = new THREE.BoxGeometry(4.4, 0.15, 0.3);
  const bumperFront = new THREE.Mesh(bumperFrontGeom, blackMat);
  bumperFront.position.set(0, 0.5, 0);
  group.add(bumperFront);

  const bumperRearGeom = new THREE.BoxGeometry(4.4, 0.15, 0.2);
  const bumperRear = new THREE.Mesh(bumperRearGeom, blackMat);
  bumperRear.position.set(0, 0.5, 0);
  group.add(bumperRear);

  group.userData.headlightPositions = [hl1.position, hl2.position];
  group.userData.brakeLightPositions = [tl1.position, tl2.position, tl3.position];

  return group;
}

function createShuttleBody(color: string): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.3,
    envMapIntensity: 0.8,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: "#87ceeb",
    roughness: 0.05,
    metalness: 0.85,
    transparent: true,
    opacity: 0.4,
    ior: 1.52,
    reflectivity: 0.95,
  });

  const bodyGeom = new THREE.BoxGeometry(7, 2.4, 2.4);
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = 1.5;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const frontGeom = new THREE.BoxGeometry(1.2, 2.4, 2.4);
  const front = new THREE.Mesh(frontGeom, bodyMat);
  front.position.set(3.6, 1.5, 0);
  front.castShadow = true;
  group.add(front);

  const windshieldGeom = new THREE.PlaneGeometry(3, 1.6, 1, 4);
  const windshield = new THREE.Mesh(windshieldGeom, glassMat);
  windshield.position.set(1.5, 2.2, 0);
  windshield.rotation.y = Math.PI / 2;
  windshield.renderOrder = 2;
  group.add(windshield);

  const sideWindowGeom = new THREE.PlaneGeometry(3.5, 1.2, 1, 6);
  const sideWindow = new THREE.Mesh(sideWindowGeom, glassMat);
  sideWindow.position.set(1.0, 2.6, 1.2);
  sideWindow.rotation.z = Math.PI / 12;
  sideWindow.renderOrder = 2;
  group.add(sideWindow);

  const sideWindow2 = sideWindow.clone();
  sideWindow2.position.set(1.0, 2.6, -1.2);
  sideWindow2.rotation.z = -Math.PI / 12;
  sideWindow2.renderOrder = 2;
  group.add(sideWindow2);

  const wheelPositions: [number, number, number][] = [
    [2.8, WHEEL_RADIUS, 1.1],
    [2.8, WHEEL_RADIUS, -1.1],
    [-2.8, WHEEL_RADIUS, 1.1],
    [-2.8, WHEEL_RADIUS, -1.1],
    [-1.2, WHEEL_RADIUS, 1.1],
    [-1.2, WHEEL_RADIUS, -1.1],
  ];

  wheelPositions.forEach(([x, y, z]) => {
    const wheel = createWheel();
    wheel.position.set(x, y, z);
    wheel.name = "wheel";
    group.add(wheel);
  });

  const headlightMat = new THREE.MeshStandardMaterial({ color: "#ffd24c", emissive: "#ffd24c", emissiveIntensity: 0.6, toneMapped: false });
  const hl1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), headlightMat);
  hl1.position.set(4.2, 1.5, 0.6);
  group.add(hl1);

  const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), headlightMat);
  hl2.position.set(4.2, 1.5, -0.6);
  group.add(hl2);

  const doorMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35 });
  const doorGeom = new THREE.PlaneGeometry(1.2, 2.0);
  const door = new THREE.Mesh(doorGeom, doorMat);
  door.name = "shuttle_door";
  door.position.set(-3.3, 1.5, 0);
  door.rotation.y = Math.PI / 2;
  group.add(door);

  const stripeMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5, transparent: true, opacity: 0.7 });
  const stripeGeom = new THREE.PlaneGeometry(3.5, 0.15);
  const stripe = new THREE.Mesh(stripeGeom, stripeMat);
  stripe.position.set(0, 2.8, 1.21);
  stripe.rotation.z = 0.1;
  group.add(stripe);

  return group;
}

function createDeliveryTruckBody(color: string): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.3,
    envMapIntensity: 0.7,
  });

  const cabGeom = new THREE.BoxGeometry(2, 1.8, 2);
  const cab = new THREE.Mesh(cabGeom, bodyMat);
  cab.position.set(2.5, 1.2, 0);
  cab.castShadow = true;
  cab.receiveShadow = true;
  group.add(cab);

  const bedGeom = new THREE.BoxGeometry(3, 1.8, 2);
  const bed = new THREE.Mesh(bedGeom, bodyMat);
  bed.position.set(-1, 1.2, 0);
  bed.castShadow = true;
  group.add(bed);

  const cabWindowMat = new THREE.MeshPhysicalMaterial({
    color: "#87ceeb",
    transparent: true,
    opacity: 0.4,
    roughness: 0.1,
    metalness: 0.8,
    ior: 1.52,
    reflectivity: 0.9,
  });

  const cabWindowGeom = new THREE.PlaneGeometry(1.6, 0.8);
  const cabWindow = new THREE.Mesh(cabWindowGeom, cabWindowMat);
  cabWindow.position.set(2.5, 1.85, 0);
  cabWindow.rotation.y = Math.PI / 2;
  cabWindow.renderOrder = 2;
  group.add(cabWindow);

  const bedSideWindowGeom = new THREE.PlaneGeometry(2.8, 1.0);
  const bedWindow = new THREE.Mesh(bedSideWindowGeom, cabWindowMat);
  bedWindow.position.set(-0.8, 1.85, 1.01);
  bedWindow.renderOrder = 2;
  group.add(bedWindow);

  const bedWindow2 = bedWindow.clone();
  bedWindow2.position.set(-0.8, 1.85, -1.01);
  bedWindow2.rotation.y = Math.PI;
  bedWindow2.renderOrder = 2;
  group.add(bedWindow2);

  const wheelPositions: [number, number, number][] = [
    [3.5, 0.5, 0.9],
    [3.5, 0.5, -0.9],
    [1.5, 0.5, 0.9],
    [1.5, 0.5, -0.9],
    [-2, 0.5, 0.9],
    [-2, 0.5, -0.9],
  ];

  wheelPositions.forEach(([x, y, z]) => {
    const wheel = createWheel();
    wheel.position.set(x, y, z);
    wheel.name = "wheel";
    group.add(wheel);
  });

  const headlightMat = new THREE.MeshStandardMaterial({ color: "#ffd24c", emissive: "#ffd24c", emissiveIntensity: 0.4, toneMapped: false });
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), headlightMat);
  hl.position.set(3.5, 1.45, 0);
  group.add(hl);

  const tailMat = new THREE.MeshStandardMaterial({ color: "#ff4444", emissive: "#ff4444", emissiveIntensity: 0.4, toneMapped: false });
  const tl1 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), tailMat);
  tl1.position.set(-2.8, 1.45, 0.6);
  group.add(tl1);
  const tl2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), tailMat);
  tl2.position.set(-2.8, 1.45, -0.6);
  group.add(tl2);

  const loadingRampGeom = new THREE.PlaneGeometry(1.5, 0.8);
  const rampMat = new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.4, roughness: 0.6 });
  const ramp = new THREE.Mesh(loadingRampGeom, rampMat);
  ramp.position.set(-1, 0.35, 1.01);
  group.add(ramp);

  return group;
}

export function createWaypointCurve(waypoints: Waypoint[]): THREE.CatmullRomCurve3 {
  const points = waypoints.map((wp) => new THREE.Vector3(wp.position[0], wp.position[1], wp.position[2]));
  return new THREE.CatmullRomCurve3(points, false);
}

export function useVehiclePath(waypoints: Waypoint[]): THREE.CatmullRomCurve3 {
  return useMemo(() => createWaypointCurve(waypoints), [waypoints]);
}

export function Vehicle({
  config,
  active = true,
  enabled = true,
}: {
  config: VehicleConfig;
  active?: boolean;
  enabled?: boolean;
}) {
  const ref = useRef<THREE.Group>(null!);
  const progressRef = useRef(config.progress || 0);
  const speedRef = useRef(0);
  const brakeRef = useRef(false);
  const shuttleDoorRef = useRef(0);

  const group = useMemo(() => {
    if (config.type === "car") return createCarBody(config.color);
    if (config.type === "shuttle") return createShuttleBody(config.color);
    return createDeliveryTruckBody(config.color);
  }, [config.type, config.color]);

  useEffect(() => {
    if (ref.current) {
      const point = config.path.getPointAt(progressRef.current);
      ref.current.position.copy(point);
      const tangent = config.path.getTangent(progressRef.current);
      const angle = Math.atan2(tangent.x, tangent.z);
      ref.current.rotation.y = angle;
    }
  }, [config]);

  useFrame(({ clock }, delta) => {
    if (!ref.current || !active || !enabled) return;

    const dt = Math.min(delta, 0.1);
    const grp = ref.current;
    const curve = config.path;

    if ((config.stops && config.stops.length > 0) && config.type === "shuttle") {
      let nearStop = false;
      let stopDuration = 0;

      for (const stop of config.stops) {
        const stopPoint = curve.getPointAt(stop.t);
        const dist = grp.position.distanceTo(stopPoint);

        if (dist < 2) {
          nearStop = true;
          stopDuration = stop.duration;
          break;
        }
      }

      if (nearStop) {
        speedRef.current = THREE.MathUtils.lerp(speedRef.current, 0.2, 0.1);
        shuttleDoorRef.current = Math.min(1, shuttleDoorRef.current + delta * 0.8);
      } else {
        speedRef.current = THREE.MathUtils.lerp(speedRef.current, config.speed, 0.08);
        shuttleDoorRef.current = Math.max(0, shuttleDoorRef.current - delta * 1.5);
      }
    } else {
      speedRef.current = THREE.MathUtils.lerp(speedRef.current, config.speed, 0.08);
    }

    if (config.type === "delivery") {
      const deliveryPhase = (clock.elapsedTime * 1000 - config.spawnTime) % DELIVERY_CYCLE;
      if (deliveryPhase < 1000) {
        speedRef.current = THREE.MathUtils.lerp(speedRef.current, config.speed, 0.08);
      } else if (deliveryPhase < DELIVERY_WAIT_DURATION + 1000) {
        if (progressRef.current > 0.45 && progressRef.current < 0.55) {
          speedRef.current = THREE.MathUtils.lerp(speedRef.current, 0.3, 0.05);
          shuttleDoorRef.current = Math.min(1, shuttleDoorRef.current + delta * 0.3);
        }
      } else {
        speedRef.current = THREE.MathUtils.lerp(speedRef.current, config.speed * 1.2, 0.08);
      }
    }

    brakeRef.current = speedRef.current < config.speed * 0.3;

    const wheels: THREE.Object3D[] = [];
    grp.traverse((child) => {
      if (child.name.includes("wheel")) wheels.push(child);
    });

    const wheelRotation = (speedRef.current / config.path.getLength()) * delta * 30;
    wheels.forEach((wheel) => {
      if (wheel) wheel.rotation.y += wheelRotation;
    });

    if (config.type === "shuttle") {
      const door = grp.getObjectByName("shuttle_door") as THREE.Mesh;
      if (door) {
        const doorOffset = shuttleDoorRef.current * 0.6;
        door.position.x = -3.3 + doorOffset;
      }
    }

    const deltaT = (speedRef.current / config.path.getLength()) * delta * 30;
    progressRef.current += deltaT;

    if (progressRef.current >= 1) {
      progressRef.current = 0;
      speedRef.current = config.speed * (0.9 + Math.random() * 0.3);
    }

    const point = curve.getPointAt(progressRef.current);
    const tangent = curve.getTangent(progressRef.current);
    const angle = Math.atan2(tangent.x, tangent.z);

    let diff = angle - grp.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    grp.rotation.y += diff * Math.min(1, speedRef.current * 2);

    grp.position.lerp(point, 0.15);
  });

  return <primitive ref={ref} object={group} />;
}
