import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createGrassTexture, createGrassNormalMap } from "./textures";

export function Ground({ terrainHeight = 0.0 }: { terrainHeight?: number }) {
  const grassTexture = useMemo(() => createGrassTexture(512), []);
  grassTexture.repeat.set(20, 20);
  grassTexture.anisotropy = 8;

  const grassNormal = useMemo(() => createGrassNormalMap(512), []);
  grassNormal.repeat.set(20, 20);
  grassNormal.anisotropy = 4;

  const heightData = useMemo(() => {
    const size = 128;
    const data = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) {
      const x = (i % size) / size;
      const y = Math.floor(i / size) / size;
      const noise1 = Math.random() * 0.6;
      const noise2 = Math.random() * 0.3;
      const distanceFromCenter = Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2);
      const slope = Math.pow(1 - distanceFromCenter, 2) * 0.15;
      data[i] = (noise1 + noise2 + slope) * 0.35 + terrainHeight;
    }
    return { data, size };
  }, [terrainHeight]);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(200, 200, heightData.size - 1, heightData.size - 1);
    geo.rotateX(-Math.PI / 2);

    const position = geo.attributes.position;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      const x = ((vertex.x + 100) / 200) * (heightData.size - 1);
      const z = ((vertex.z + 100) / 200) * (heightData.size - 1);
      const idx = Math.floor(z) * heightData.size + Math.floor(x);
      const clampedIdx = Math.max(0, Math.min(heightData.size * heightData.size - 1, idx));
      vertex.y = heightData.data[clampedIdx];
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    position.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [heightData]);

  const grassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: grassTexture,
        normalMap: grassNormal,
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughness: 0.9,
        metalness: 0.0,
        color: "#2f5a3a",
      }),
    [grassTexture, grassNormal],
  );

  return (
    <group receiveShadow>
      <mesh geometry={geometry} material={grassMat} receiveShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0.005, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color="#3a6b42"
          roughness={0.95}
          metalness={0.0}
          transparent
          opacity={0.12}
        />
      </mesh>
    </group>
  );
}

export default Ground;
