/**
 * CollegeOS Curriculum Seed Script
 *
 * Populates the expected semester-wise curriculum for BSc IT program.
 * Run with: node scripts/seed-curriculum.js
 *
 * This script is idempotent - it will only create missing courses.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../backend/src/config/database.js";
import { Course } from "../backend/src/models/index.js";

const ACADEMIC_YEAR = "2025/2026";
const PROGRAM = "BScIT";
const DEPARTMENT = "Computer Science and IT";

const CURRICULUM = [
  // Semester I â€” Level 1
  {
    semester: 1,
    code: "CT042-3-1",
    name: "Introduction to Databases",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 1,
    code: "CT109-3-1",
    name: "Digital Thinking & Innovation",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 1,
    code: "CT043-3-1",
    name: "Introduction to Networking",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 1,
    code: "CT123-3-1",
    name: "System Software and Computing Concepts",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 1,
    code: "CT108-3-1",
    name: "Programming with Python",
    credits: 4,
    courseType: "CORE",
  },
  {
    semester: 1,
    code: "NP-LBEF002",
    name: "Personality Development",
    credits: 2,
    courseType: "ELECTIVE",
  },
  {
    semester: 1,
    code: "NP-LBEF001",
    name: "Nepal Parichaya",
    credits: 2,
    courseType: "ELECTIVE",
  },

  // Semester II — Level 1
  {
    semester: 2,
    code: "BCA201",
    name: "System Analysis and Design",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 2,
    code: "BCA202",
    name: "Integrated Computer Systems",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 2,
    code: "BCA203",
    name: "Mathematical Concepts for Computing",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 2,
    code: "BCA204",
    name: "Fundamentals of Web Design and Development",
    credits: 4,
    courseType: "CORE",
  },
  {
    semester: 2,
    code: "BCA205",
    name: "Introduction to Security and Forensic Technologies",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 2,
    code: "BCA206",
    name: "Fundamental of Entrepreneurship",
    credits: 2,
    courseType: "ELECTIVE",
  },
  {
    semester: 2,
    code: "BCA207",
    name: "Co-Curricular Activity",
    credits: 1,
    courseType: "ELECTIVE",
  },

  // Semester III — Level 2
  {
    semester: 3,
    code: "BCA301",
    name: "Programming for Data Analysis",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 3,
    code: "BCA302",
    name: "Systems Development Methods",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 3,
    code: "BCA303",
    name: "Object Oriented Development with Java",
    credits: 4,
    courseType: "CORE",
  },
  {
    semester: 3,
    code: "BCA304",
    name: "Innovation Process",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 3,
    code: "BCA305",
    name: "Integrated Business Processes with SAP ERP Systems",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 3,
    code: "BCA306",
    name: "Systems and Network Administration",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 3,
    code: "BCA307",
    name: "Technical Communication",
    credits: 2,
    courseType: "ELECTIVE",
  },

  // Semester IV — Level 2
  {
    semester: 4,
    code: "BCA401",
    name: "Research Methods for Computing and Technology",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 4,
    code: "BCA402",
    name: "Mobile and Wireless Technology",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 4,
    code: "BCA403",
    name: "Concurrent Programming",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 4,
    code: "BCA404",
    name: "Human Computer Interaction",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 4,
    code: "BCA405",
    name: "Web Applications",
    credits: 4,
    courseType: "CORE",
  },
  {
    semester: 4,
    code: "BCA406",
    name: "Data Centre Infrastructure",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 4,
    code: "BCA407",
    name: "Workplace Professional Skills",
    credits: 2,
    courseType: "ELECTIVE",
  },

  // Semester V — Level 3
  {
    semester: 5,
    code: "BCA501",
    name: "Investigations",
    credits: 3,
    courseType: "PROJECT",
  },
  {
    semester: 5,
    code: "BCA502",
    name: "Project Management",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 5,
    code: "BCA503",
    name: "Critical Issues in Managing Information Systems in Organizations",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 5,
    code: "BCA504",
    name: "Cloud Infrastructure and Services",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 5,
    code: "BCA505",
    name: "Mobile and Web Multimedia",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 5,
    code: "BCA506",
    name: "Venture Building",
    credits: 3,
    courseType: "CORE",
  },
  // Option Module 1 — applicable choice (choose one)
  {
    semester: 5,
    code: "BCA511",
    name: "Internet of Things",
    credits: 3,
    courseType: "ELECTIVE",
  },
  {
    semester: 5,
    code: "BCA512",
    name: "Distributed Computer Systems",
    credits: 3,
    courseType: "ELECTIVE",
  },
  {
    semester: 5,
    code: "BCA513",
    name: "Blockchain Development",
    credits: 3,
    courseType: "ELECTIVE",
  },

  // Semester VI — Level 3
  {
    semester: 6,
    code: "BCA601",
    name: "Emergent Technology",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 6,
    code: "BCA602",
    name: "Advanced Database Systems",
    credits: 3,
    courseType: "CORE",
  },
  {
    semester: 6,
    code: "BCA603",
    name: "Final Year Project",
    credits: 6,
    courseType: "PROJECT",
  },
  // Option Module 2 — applicable choice (choose one)
  {
    semester: 6,
    code: "BCA611",
    name: "Designing and Developing Applications",
    credits: 3,
    courseType: "ELECTIVE",
  },
  {
    semester: 6,
    code: "BCA612",
    name: "Knowledge Discovery and Big Data",
    credits: 3,
    courseType: "ELECTIVE",
  },
];

async function main() {
  await connectDatabase();

  console.log("🌱 Seeding CollegeOS curriculum...");
  console.log(`   Program: ${PROGRAM}`);
  console.log(`   Department: ${DEPARTMENT}`);
  console.log(`   Academic Year: ${ACADEMIC_YEAR}`);
  console.log("");

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const courseData of CURRICULUM) {
    try {
      const existing = await Course.findOne({ code: courseData.code }).select(
        "_id",
      );

      if (existing) {
        console.log(
          `⏭️  SKIP: ${courseData.code} - ${courseData.name} (already exists)`,
        );
        skipped++;
        continue;
      }

      const course = await Course.create({
        ...courseData,
        department: DEPARTMENT,
        program: PROGRAM,
        programCode: PROGRAM,
        academicYear: ACADEMIC_YEAR,
        status: "ACTIVE",
        description: `${courseData.name} - ${PROGRAM} Semester ${courseData.semester}`,
      });

      console.log(
        `CREATED: ${course.code} - ${course.name} (Sem ${course.semester}, ${course.credits} cr, ${course.courseType})`,
      );
      created++;
    } catch (error) {
      console.error(
        ` ERROR: ${courseData.code} - ${courseData.name}: ${error.message}`,
      );
      errors.push({ code: courseData.code, error: error.message });
    }
  }

  console.log("");
  console.log("📊 Summary:");
  console.log(`   Created: ${created}`);
  console.log(`   Skipped (existing): ${skipped}`);
  console.log(`   Errors: ${errors.length}`);
  console.log(`   Total in curriculum: ${CURRICULUM.length}`);

  if (errors.length > 0) {
    console.log("");
    console.log("❌ Errors:");
    errors.forEach((e) => console.log(`   ${e.code}: ${e.error}`));
  }

  // Verify final state
  const allCourses = await Course.find({ program: PROGRAM })
    .sort({ semester: 1, code: 1 })
    .lean();
  console.log("");
  console.log("📚 Final curriculum state:");
  let currentSem = 0;
  for (const course of allCourses) {
    if (course.semester !== currentSem) {
      currentSem = course.semester;
      console.log(`\n  Semester ${currentSem}:`);
    }
    console.log(
      `    ${course.code} - ${course.name} (${course.credits} cr, ${course.courseType})`,
    );
  }
  console.log(`\n  Total courses for ${PROGRAM}: ${allCourses.length}`);

  await mongoose.connection.close();
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error("💥 Seed failed:", error);
  await mongoose.connection.close().catch(() => undefined);
  process.exit(1);
});
