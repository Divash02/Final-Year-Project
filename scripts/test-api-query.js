import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../backend/src/config/database.js";
import { Course } from "../backend/src/models/index.js";

async function main() {
  await connectDatabase();

  // Simulate the exact query from frontend: /courses?scope=curriculum&limit=500&semester=1&semester=2
  const query = {
    semester: { $in: [1, 2] },
    status: "ACTIVE",
  };
  const courses = await Course.find(query).sort({ semester: 1, code: 1 }).limit(500).lean();
  console.log("Courses for semester 1 & 2:", courses.length);
  courses.forEach((c) =>
    console.log(
      "  Sem " + c.semester + ": " + c.code + " - " + c.name + " (" + c.credits + " cr, " + c.courseType + ")"
    )
  );

  // Test the serialization format expected by frontend
  console.log("");
  console.log("Frontend serialization format:");
  courses.slice(0, 3).forEach((c) => {
    console.log(
      JSON.stringify(
        {
          id: c._id.toString(),
          _id: c._id.toString(),
          code: c.code,
          name: c.name,
          department: c.department || null,
          program: c.program || c.programCode || null,
          credits: c.credits ?? null,
          semester: c.semester ?? null,
          academicYear: c.academicYear || null,
          courseType: c.courseType || "CORE",
          status: c.status || "ACTIVE",
        },
        null,
        2
      )
    );
  });

  // Test filters endpoint
  console.log("");
  console.log("Testing /courses/filters endpoint:");
  const [allCourses] = await Promise.all([
    Course.find().select("department program semester academicYear courseType status").lean(),
  ]);
  
  const uniqueSorted = (values) =>
    Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true })
    );

  console.log("Semesters:", uniqueSorted(allCourses.map((row) => row.semester)).sort((a, b) => a - b));
  console.log("Departments:", uniqueSorted(allCourses.map((row) => row.department)));
  console.log("Programs:", uniqueSorted(allCourses.map((row) => row.program)));

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Test failed:", error);
  await mongoose.connection.close().catch(() => undefined);
  process.exit(1);
});