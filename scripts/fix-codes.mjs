import "dotenv/config";
import mongoose from "mongoose";
import { Course } from "../backend/src/models/Course.js";

const updates = [
  ["Introduction to Databases", "CT042-3-1"],
  ["Digital Thinking and Innovation", "CT109-3-1"],
  ["Digital Thinking & Innovation", "CT109-3-1"],
  ["Introduction to Networking", "CT043-3-1"],
  ["System Software and Computing Concepts", "CT123-3-1"],
  ["Python Programming", "CT108-3-1"],
  ["Personality Development", "NP-LBEF002"],
  ["Nepal Parichaya", "NP-LBEF001"],
  ["Fundamental of Entrepreneurship", "BM049-2-1"],
  ["Mathematical Concepts for Computing", "AQ010-3-1"],
  ["Co-Curricular Activity", "NP-LBEF004"],
  ["System Analysis and Design", "CT026-3-1"],
  ["Integrated Computer Systems", "CT124-3-1"],
  ["Fundamentals of Web Design and Development", "CT053-3-1"],
  ["Introduction to Security and Forensic Technologies", "CT046-3-1"],
  ["Integrated Business Processes with SAP ERP Systems", "CT104-3-2"],
  ["Systems and Network Administration", "CT0106-3-2"],
  ["Technical Communication", "NP-LBEF003"],
  ["Innovation Process", "BM111-2-2"],
  ["Systems Development Methods", "CT046-3-2"],
  ["Programming for Data Analysis", "CT127-3-2"],
  ["Research Methods for Computing and Technology", "CT098-3-2"],
  ["Research Methods for Computing & Technology", "CT098-3-2"],
  ["Human Computer Interaction", "CT026-3-2"],
  ["Workplace Professional Skills", "MPU3212"],
  ["Data Centre Infrastructure", "CT109-3-2"],
  ["Mobile and Wireless Technology", "CT090-3-2"],
  ["Web Applications", "CT050-3-2"],
  ["Concurrent Programming", "CT074-3-2"],
];

await mongoose.connect(process.env.MONGODB_URI);
for (const [title, code] of updates) {
  const res = await Course.updateMany({ name: title }, { $set: { code } });
  console.log(title, res.modifiedCount);
}
await mongoose.disconnect();
