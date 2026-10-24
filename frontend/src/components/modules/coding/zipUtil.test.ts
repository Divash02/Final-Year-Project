import test from "node:test";
import assert from "node:assert/strict";
import { buildZip, crc32, sanitizeFileName, readTextFile } from "./zipUtil.ts";

test("crc32 matches known checksums", () => {
  const encoder = new TextEncoder();
  assert.equal(crc32(encoder.encode("")), 0x00000000);
  assert.equal(crc32(encoder.encode("123456789")), 0xcbf43926);
  assert.equal(crc32(encoder.encode("The quick brown fox jumps over the lazy dog")), 0x414fa339);
});

test("buildZip produces a readable store-method archive", async () => {
  const blob = buildZip([
    { name: "hello.py", data: 'print("hi")\n' },
    { name: "notes/main.txt", data: "CollegeOS" },
  ]);
  assert.equal(blob.type, "application/zip");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50); // local file header

  const text = new TextDecoder("utf-8").decode(bytes);
  assert.ok(text.includes("hello.py"));
  assert.ok(text.includes("print(\"hi\")"));
  assert.ok(text.includes("notes/main.txt"));
  assert.ok(text.includes("CollegeOS"));

  // End of central directory record is present with two entries.
  const eocdOffset = bytes.length - 22;
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50);
  assert.equal(view.getUint16(eocdOffset + 8, true), 2);
});

test("sanitizeFileName removes paths and traversal", () => {
  assert.equal(sanitizeFileName("solution.py"), "solution.py");
  assert.equal(sanitizeFileName("../../etc/passwd"), "etc_passwd");
  assert.equal(sanitizeFileName("sub/dir\\file.txt"), "sub_dir_file.txt");
  assert.throws(() => sanitizeFileName(".hidden"), /not valid/);
  assert.throws(() => sanitizeFileName(""), /not valid/);
});

test("readTextFile reads small files and rejects oversized ones", async () => {
  const small = new File(["hello"], "a.txt", { type: "text/plain" });
  assert.equal(await readTextFile(small), "hello");
  const huge = new File([new ArrayBuffer(600 * 1024)], "big.bin", {
    type: "application/octet-stream",
  });
  await assert.rejects(() => readTextFile(huge), /larger than 512 KiB/);
});
