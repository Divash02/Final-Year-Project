import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import type { TimeOfDay } from "./constants";

function makeSide(size: number, color: string, shade: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = 0.8 + Math.random() * 0.2;
    const base = shade + 0.5;
    data[i] = Math.round(160 * noise * (0.7 + base * 0.5));
    data[i + 1] = Math.round(170 * noise * (0.6 + base * 0.6));
    data[i + 2] = Math.round(185 * noise * (0.5 + base * 0.8));
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 25; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 25 + 10;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  return canvas;
}

export function createEnvironmentMap(size = 256): THREE.CanvasTexture[] {
  const sides = [
    { color: "#87ceeb", shade: 0 },
    { color: "#5a7d9e", shade: -0.1 },
    { color: "#b3d9e6", shade: 0.2 },
    { color: "#2a4a2a", shade: -0.3 },
    { color: "#87ceeb", shade: 0 },
    { color: "#5a7d9e", shade: -0.1 },
  ];

  return sides.map((s) => makeSideTexture(size, s.color, s.shade));
}

function makeSideTexture(size: number, color: string, shade: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = 0.8 + Math.random() * 0.2;
    const base = shade + 0.5;
    data[i] = Math.round(160 * noise * (0.7 + base * 0.5));
    data[i + 1] = Math.round(170 * noise * (0.6 + base * 0.6));
    data[i + 2] = Math.round(185 * noise * (0.5 + base * 0.8));
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 25; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 25 + 10;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function Environment({ timeOfDay = "day" as TimeOfDay }) {
  const { scene } = useThree();

  const envMap = useMemo(() => {
    const cubeTexture = new THREE.CubeTexture();
    const sideTextures = createEnvironmentMap(128);
    cubeTexture.image = [
      sideTextures[0].image,
      sideTextures[1].image,
      sideTextures[2].image,
      sideTextures[3].image,
      sideTextures[4].image,
      sideTextures[5].image,
    ];
    cubeTexture.needsUpdate = true;
    (cubeTexture as any).colorSpace = THREE.SRGBColorSpace;
    return cubeTexture;
  }, []);

  useEffect(() => {
    scene.environment = envMap;
    return () => {
      scene.environment = null;
    };
  }, [envMap, scene]);

  return null;
}

const skyVert = `
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFrag = `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform vec3 horizonColor;
  uniform float time;
  varying vec3 vWorldPos;
  void main() {
    float h = normalize(vWorldPos + vec3(0.0, 20.0, 0.0)).y;
    float horizonBlend = smoothstep(-0.1, 0.1, h);
    vec3 color = mix(horizonColor, bottomColor, 1.0 - horizonBlend);
    color = mix(color, topColor, max(h, 0.0));
    
    vec3 sunDir = normalize(vec3(sin(time * 0.1) * 0.3, 0.8, cos(time * 0.1) * 0.3));
    float sunDot = dot(normalize(vWorldPos), sunDir);
    float sun = pow(max(sunDot, 0.0), 20.0);
    color += sun * 0.3;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

interface SkyProps {
  timeOfDay?: TimeOfDay;
}

export function Sky({ timeOfDay = "day" }: SkyProps) {
  const config = useMemo(() => {
    switch (timeOfDay) {
      case "night":
        return {
          topColor: new THREE.Color("#020210"),
          bottomColor: new THREE.Color("#0a0f20"),
          horizonColor: new THREE.Color("#1a1a3a"),
        };
      case "evening":
        return {
          topColor: new THREE.Color("#1a1a3a"),
          bottomColor: new THREE.Color("#2a1a2a"),
          horizonColor: new THREE.Color("#7a3b2a"),
        };
      default:
        return {
          topColor: new THREE.Color("#87ceeb"),
          bottomColor: new THREE.Color("#b3d9e6"),
          horizonColor: new THREE.Color("#e0f2fe"),
        };
    }
  }, [timeOfDay]);

  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: config.topColor },
          bottomColor: { value: config.bottomColor },
          horizonColor: { value: config.horizonColor },
          time: { value: 0 },
        },
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [config],
  );

  useFrame(({ clock }) => {
    skyMat.uniforms.time.value = clock.elapsedTime;
  });

  return <mesh geometry={new THREE.SphereGeometry(280, 32, 32)} material={skyMat} />;
}

export default Environment;
