/**
 * Minimal ZIP archive writer (STORE method — no compression).
 *
 * Produces a valid, readable .zip for project export without
 * adding a dependency to the bundle. CRC-32 is computed with
 * the standard polynomial table; entries use DOS epoch
 * timestamps, which every unzipper accepts.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: string;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, date: day };
}

function encodeText(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(value));
}

/** Builds a ZIP archive containing the given text files. */
export function buildZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  const now = new Date();
  const { time, date } = dosDateTime(now);

  for (const entry of entries) {
    const nameBytes = new Uint8Array(
      encoder.encode(entry.name.replace(/\\/g, "/")),
    );
    const dataBytes = encodeText(entry.data);
    const crc = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0x0800, true); // UTF-8 flag
    localView.setUint16(8, 0, true); // STORE
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    parts.push(local, dataBytes);

    const centralEntry = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralEntry.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralEntry.set(nameBytes, 46);
    central.push(centralEntry);

    offset += local.length + dataBytes.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], {
    type: "application/zip",
  });
}

/** Reads a text file chosen through the browser file picker. */
export async function readTextFile(file: File): Promise<string> {
  const MAX_UPLOAD_BYTES = 512 * 1024;
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} is larger than 512 KiB.`);
  }
  return file.text();
}

/** Sanitises a file name for storage: no paths, no traversal. */
export function sanitizeFileName(name: string): string {
  const cleaned = String(name || "")
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "_")
    .replace(/[<>:"|?*]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
  if (!cleaned || cleaned.startsWith(".")) {
    throw new Error("That file name is not valid.");
  }
  if (cleaned.length > 120) {
    return cleaned.slice(0, 120);
  }
  return cleaned;
}
