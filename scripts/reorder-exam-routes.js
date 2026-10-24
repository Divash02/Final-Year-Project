import fs from "fs";
import path from "path";

const filePath = path.resolve("./backend/src/routes/examinations.js");
let content = fs.readFileSync(filePath, "utf8");

const marker1 = "14b. Institutional Grading Scale API";
const marker2 = "15. Get Results & Enrolled Marks";
const marker3 = "9. Get Single Examination Details";

const idx1 = content.indexOf(marker1);
const idx2 = content.indexOf(marker2);
const idx3 = content.indexOf(marker3);

if (idx1 === -1 || idx2 === -1 || idx3 === -1) {
  console.error("Markers not found:", { idx1, idx2, idx3 });
  process.exit(1);
}

const startBlock = content.lastIndexOf("/**", idx1);
const endBlock = content.lastIndexOf("/**", idx2);
const insertPos = content.lastIndexOf("/**", idx3);

const extractedBlock = content.substring(startBlock, endBlock);
content = content.substring(0, startBlock) + content.substring(endBlock);

const newInsertPos = content.lastIndexOf("/**", content.indexOf(marker3));
content = content.substring(0, newInsertPos) + extractedBlock + "\n\n  " + content.substring(newInsertPos);

fs.writeFileSync(filePath, content, "utf8");
console.log("Successfully reordered static exam routes before /api/exams/:id!");
