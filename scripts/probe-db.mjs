import mongoose from "mongoose";
import "dotenv/config";

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
const db = mongoose.connection.db;
const names = [
  "enrollments",
  "courseteachingassignments",
  "attendancesessions",
  "exams",
  "programs",
  "sections",
  "notices",
  "messages",
  "institutionsettings",
];
for (const name of names) {
  const rows = await db.collection(name).find({}).limit(40).toArray();
  console.log(`\n=== ${name} (${rows.length}) ===`);
  for (const row of rows) {
    const clone = { ...row };
    delete clone._id;
    console.log(JSON.stringify(clone));
  }
}
await mongoose.disconnect();
