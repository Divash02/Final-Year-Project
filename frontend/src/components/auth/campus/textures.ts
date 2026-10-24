import * as THREE from "three";

export interface TextureBundle {
  brick: THREE.CanvasTexture;
  concrete: THREE.CanvasTexture;
  asphalt: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
  brickNormal: THREE.CanvasTexture;
  concreteNormal: THREE.CanvasTexture;
  asphaltNormal: THREE.CanvasTexture;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export function createBrickTexture(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const brickW = size / 4;
  const brickH = size / 8;

  ctx.fillStyle = "#c96532";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#a8481f";
  for (let row = 0; row < 8; row++) {
    const y = row * brickH;
    const offsetX = row % 2 === 0 ? 0 : -brickW / 2;
    for (let col = -1; col < 6; col++) {
      const x = col * brickW + offsetX;
      if (x >= -brickW && x < size) {
        ctx.fillRect(x, y, brickW, brickH);
        ctx.strokeStyle = "#e0c9a6";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, brickW, brickH);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

export function createBrickNormalMap(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const brickW = size / 4;
  const brickH = size / 8;
  const mortar = size / 32;

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let value = 0;

      const inBrick = !((x % brickW < mortar) || (y % brickH < mortar));
      if (inBrick) {
        value = 60;
      }

      data[idx] = 128;
      data[idx + 1] = 128 + (inBrick ? -20 : 0);
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  tex.anisotropy = 4;
  return tex;
}

export function createConcreteTexture(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.random() * 0.12 - 0.06 + 0.78;
    data[i] = 180 * noise;
    data[i + 1] = 185 * noise;
    data[i + 2] = 195 * noise;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  ctx.fillStyle = "#b8bccf";
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

export function createConcreteNormalMap(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (Math.random() - 0.5) * 2;
      const ny = (Math.random() - 0.5) * 2;

      data[idx] = 128 + nx * 30;
      data[idx + 1] = 128 + ny * 30;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}

export function createAsphaltTexture(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise1 = Math.random() * 0.15;
    const noise2 = Math.random() * 0.1;
    const gray = 28 + noise1 * 20 + noise2 * 10;
    data[i] = gray;
    data[i + 1] = gray * 0.9;
    data[i + 2] = gray * 0.8;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  ctx.strokeStyle = "rgba(200,200,200,0.15)";
  ctx.lineWidth = 2;
  for (let i = 20; i < size - 20; i += 30) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 12);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

export function createAsphaltNormalMap(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (Math.random() - 0.5) * 2;
      const ny = (Math.random() - 0.5) * 2;

      data[idx] = 128 + nx * 20;
      data[idx + 1] = 128 + ny * 20;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 12);
  tex.anisotropy = 4;
  return tex;
}

export function createRoadMarkingTexture(size = 512): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1a1a1e";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size / 64;
  ctx.setLineDash([size / 24, size / 24]);
  ctx.lineCap = "round";

  const laneY = size / 2;
  ctx.beginPath();
  ctx.moveTo(0, laneY);
  ctx.lineTo(size, laneY);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = size / 96;
  const arrowX = size / 2;
  const arrowY = size / 3;
  ctx.beginPath();
  ctx.moveTo(arrowX - size / 32, arrowY - size / 32);
  ctx.lineTo(arrowX + size / 32, arrowY);
  ctx.lineTo(arrowX - size / 32, arrowY + size / 32);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 2;
  return tex;
}

export function createGrassTexture(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = 0.85 + Math.random() * 0.15;
    data[i] = Math.round(40 * noise);
    data[i + 1] = Math.round(90 * noise);
    data[i + 2] = Math.round(55 * noise);
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  const darker = "#234d33";
  const lighter = "#3a7d44";
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = Math.random() * 1.2 + 0.3;
    ctx.fillStyle = Math.random() > 0.5 ? darker : lighter;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(20, 20);
  tex.anisotropy = 8;
  return tex;
}

export function createGrassNormalMap(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (Math.random() - 0.5) * 2;
      const ny = (Math.random() - 0.5) * 2;

      data[idx] = 128 + nx * 15;
      data[idx + 1] = 128 + ny * 15;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(20, 20);
  tex.anisotropy = 4;
  return tex;
}

export function createSidewalkTexture(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = 0.9 + Math.random() * 0.1;
    data[i] = Math.round(200 * noise);
    data[i + 1] = Math.round(205 * noise);
    data[i + 2] = Math.round(215 * noise);
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  ctx.strokeStyle = "rgba(160,160,160,0.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const y = (i + 1) * (size / 4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

export function createSidewalkNormalMap(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (Math.random() - 0.5) * 2;
      const ny = (Math.random() - 0.5) * 2;

      data[idx] = 128 + nx * 10;
      data[idx + 1] = 128 + ny * 10;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = 4;
  return tex;
}

export function createStoneTexture(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = 0.85 + Math.random() * 0.15;
    data[i] = Math.round(120 * noise);
    data[i + 1] = Math.round(125 * noise);
    data[i + 2] = Math.round(130 * noise);
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  ctx.fillStyle = "#9a9fa8";
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = Math.random() * 4 + 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

export function createMetalTexture(size = 256): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = 0.8 + Math.random() * 0.2;
    data[i] = Math.round(70 * noise);
    data[i + 1] = Math.round(75 * noise);
    data[i + 2] = Math.round(85 * noise);
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  ctx.strokeStyle = "rgba(200,200,200,0.1)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 4;
  return tex;
}

export function getTextures(): TextureBundle {
  return {
    brick: createBrickTexture(),
    concrete: createConcreteTexture(),
    asphalt: createAsphaltTexture(),
    grass: createGrassTexture(),
    brickNormal: createBrickNormalMap(),
    concreteNormal: createConcreteNormalMap(),
    asphaltNormal: createAsphaltNormalMap(),
  };
}

export function getRoadTexture(): THREE.CanvasTexture {
  return createRoadMarkingTexture();
}

export function getSidewalkTexture(): THREE.CanvasTexture {
  return createSidewalkTexture();
}

export function getSidewalkNormalMap(): THREE.CanvasTexture {
  return createSidewalkNormalMap();
}

export function getGrassNormalMap(): THREE.CanvasTexture {
  return createGrassNormalMap();
}

export function getStoneTexture(): THREE.CanvasTexture {
  return createStoneTexture();
}

export function getMetalTexture(): THREE.CanvasTexture {
  return createMetalTexture();
}
