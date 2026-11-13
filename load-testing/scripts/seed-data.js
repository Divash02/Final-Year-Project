#!/usr/bin/env node

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { faker } = require('@faker-js/faker');
const readline = require('readline');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/collegeos';

function confirmSeeding() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    console.log('⚠️  WARNING: This will seed data into the database at:', MONGODB_URI);
    console.log('   This should ONLY be run against a development/test database.');
    console.log('   NEVER run this against production!');
    console.log('');
    rl.question('Type "SEED DEV DATABASE" to confirm: ', (answer) => {
      rl.close();
      resolve(answer === 'SEED DEV DATABASE');
    });
  });
}

const PROGRAMS = [
  { code: 'BSCS', name: 'Bachelor of Science in Computer Science', duration: 8 },
  { code: 'BBA', name: 'Bachelor of Business Administration', duration: 8 },
  { code: 'BSCE', name: 'Bachelor of Science in Civil Engineering', duration: 8 },
  { code: 'BSEE', name: 'Bachelor of Science in Electrical Engineering', duration: 8 },
  { code: 'BSCHE', name: 'Bachelor of Science in Chemical Engineering', duration: 8 },
  { code: 'BSIT', name: 'Bachelor of Science in Information Technology', duration: 8 },
  { code: 'MSCS', name: 'Master of Science in Computer Science', duration: 4 },
  { code: 'MBA', name: 'Master of Business Administration', duration: 4 },
];

const COURSES = {
  BSCS: [
    { code: 'CS101', name: 'Introduction to Programming', credits: 3 },
    { code: 'CS102', name: 'Data Structures and Algorithms', credits: 3 },
    { code: 'CS201', name: 'Database Systems', credits: 3 },
    { code: 'CS202', name: 'Operating Systems', credits: 3 },
    { code: 'CS301', name: 'Software Engineering', credits: 3 },
    { code: 'CS302', name: 'Computer Networks', credits: 3 },
    { code: 'CS401', name: 'Artificial Intelligence', credits: 3 },
    { code: 'CS402', name: 'Machine Learning', credits: 3 },
    { code: 'CS403', name: 'Capstone Project', credits: 6 },
  ],
  BBA: [
    { code: 'BUS101', name: 'Principles of Management', credits: 3 },
    { code: 'BUS102', name: 'Financial Accounting', credits: 3 },
    { code: 'BUS201', name: 'Marketing Management', credits: 3 },
    { code: 'BUS202', name: 'Organizational Behavior', credits: 3 },
    { code: 'BUS301', name: 'Strategic Management', credits: 3 },
    { code: 'BUS302', name: 'Business Ethics', credits: 3 },
    { code: 'BUS401', name: 'International Business', credits: 3 },
    { code: 'BUS402', name: 'Entrepreneurship', credits: 3 },
    { code: 'BUS403', name: 'Business Capstone', credits: 6 },
  ],
};

const BATCHES = [
  { name: 'Fall 2022', startDate: '2022-09-01', endDate: '2026-06-30' },
  { name: 'Spring 2023', startDate: '2023-02-01', endDate: '2027-01-31' },
  { name: 'Fall 2023', startDate: '2023-09-01', endDate: '2027-06-30' },
  { name: 'Spring 2024', startDate: '2024-02-01', endDate: '2028-01-31' },
  { name: 'Fall 2024', startDate: '2024-09-01', endDate: '2028-06-30' },
];

const SEMESTERS = [
  { name: 'Fall 2024', startDate: '2024-09-01', endDate: '2024-12-20', isActive: true },
  { name: 'Spring 2025', startDate: '2025-01-15', endDate: '2025-05-15', isActive: false },
];

const FEE_CATEGORIES = [
  { name: 'Tuition Fee', code: 'TUITION', isRecurring: true, frequency: 'semester' },
  { name: 'Lab Fee', code: 'LAB', isRecurring: true, frequency: 'semester' },
  { name: 'Library Fee', code: 'LIBRARY', isRecurring: true, frequency: 'semester' },
  { name: 'Exam Fee', code: 'EXAM', isRecurring: true, frequency: 'semester' },
  { name: 'Hostel Fee', code: 'HOSTEL', isRecurring: true, frequency: 'semester' },
  { name: 'Transport Fee', code: 'TRANSPORT', isRecurring: true, frequency: 'semester' },
  { name: 'Admission Fee', code: 'ADMISSION', isRecurring: false, frequency: 'one-time' },
  { name: 'Graduation Fee', code: 'GRADUATION', isRecurring: false, frequency: 'one-time' },
];

const NOTICE_CATEGORIES_ENUM = ['ACADEMIC', 'EXAMINATION', 'ADMINISTRATIVE', 'EVENT', 'URGENT', 'HOLIDAY'];

const User = require('../../backend/src/models/User');
const Student = require('../../backend/src/models/Student');
const Program = require('../../backend/src/models/Program');
const Course = require('../../backend/src/models/Course');
const Batch = require('../../backend/src/models/Batch');
const Semester = require('../../backend/src/models/Semester');
const FeeCategory = require('../../backend/src/models/FeeCategory');
const Notice = require('../../backend/src/models/Notice');
const AttendanceSession = require('../../backend/src/models/AttendanceSession');
const Staff = require('../../backend/src/models/Staff');

async function connectDB() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');
}

async function seedPrograms() {
  console.log('Seeding programs...');
  const programs = [];
  for (const p of PROGRAMS) {
    let program = await Program.findOne({ code: p.code });
    if (!program) {
      program = await Program.create(p);
    }
    programs.push(program);
  }
  return programs;
}

async function seedCourses(programs) {
  console.log('Seeding courses...');
  const courses = [];
  for (const program of programs) {
    const programCourses = COURSES[program.code] || [];
    for (const c of programCourses) {
      let course = await Course.findOne({ code: c.code, program: program._id });
      if (!course) {
        course = await Course.create({ ...c, program: program._id });
      }
      courses.push(course);
    }
  }
  return courses;
}

async function seedBatches() {
  console.log('Seeding batches...');
  const batches = [];
  for (const b of BATCHES) {
    let batch = await Batch.findOne({ name: b.name });
    if (!batch) {
      batch = await Batch.create(b);
    }
    batches.push(batch);
  }
  return batches;
}

async function seedSemesters() {
  console.log('Seeding semesters...');
  const semesters = [];
  for (const s of SEMESTERS) {
    let semester = await Semester.findOne({ name: s.name });
    if (!semester) {
      semester = await Semester.create(s);
    }
    semesters.push(semester);
  }
  return semesters;
}

async function seedFeeCategories() {
  console.log('Seeding fee categories...');
  const categories = [];
  for (const c of FEE_CATEGORIES) {
    let category = await FeeCategory.findOne({ code: c.code });
    if (!category) {
      category = await FeeCategory.create(c);
    }
    categories.push(category);
  }
  return categories;
}

async function seedUsers(programs, batches, count) {
  console.log(`Seeding ${count} users...`);
  
  const users = [];
  
  const passwordHash = await bcrypt.hash('StudentPass123!', 12);
  const facultyPasswordHash = await bcrypt.hash('FacultyPass123!', 12);
  const adminPasswordHash = await bcrypt.hash('AdminPass123!', 12);
  
  for (let i = 1; i <= count; i++) {
    const program = programs[Math.floor(Math.random() * programs.length)];
    const batch = batches[Math.floor(Math.random() * batches.length)];
    const semester = Math.floor(Math.random() * 8) + 1;
    
    const email = `student${i}@techspire.edu.np`;
    let user = await User.findOne({ email });
    
    if (!user) {
      user = await User.create({
        email,
        collegeEmail: email,
        passwordHash,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        phone: faker.phone.number('98#########'),
        roles: ['student'],
        activeRole: 'student',
        isActive: true,
        isVerified: true,
        accountStatus: 'ACTIVE',
        passwordStatus: 'PERMANENT',
        mustChangePassword: false,
        lastLoginAt: new Date(),
      });
      
      await Student.create({
        user: user._id,
        studentId: `STU${String(i).padStart(6, '0')}`,
        rollNumber: `STU${String(i).padStart(6, '0')}`,
        enrollmentId: `ENR-${String(i).padStart(6, '0')}`,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        collegeEmail: user.email,
        phone: user.phone,
        program: program._id,
        programCode: program.code,
        batch: batch._id,
        section: 'A',
        semester,
        campus: 'Main Campus',
        status: 'active',
        bloodGroup: faker.helpers.arrayElement(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
        emergencyContact: {
          name: faker.person.fullName(),
          phone: faker.phone.number('98#########'),
          relation: 'Parent',
        },
      });
    }
    users.push(user);
    
    if (i % 50 === 0) {
      console.log(`  Created ${i} students...`);
    }
  }
  
  for (let i = 1; i <= 20; i++) {
    const email = `faculty${i}@techspire.edu.np`;
    let user = await User.findOne({ email });
    
    if (!user) {
      user = await User.create({
        email,
        collegeEmail: email,
        passwordHash: facultyPasswordHash,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        phone: faker.phone.number('98#########'),
        roles: ['faculty'],
        activeRole: 'faculty',
        isActive: true,
        isVerified: true,
        accountStatus: 'ACTIVE',
        passwordStatus: 'PERMANENT',
        mustChangePassword: false,
        lastLoginAt: new Date(),
      });
      
      await Staff.create({
        user: user._id,
        employeeId: `EMP${String(i).padStart(5, '0')}`,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        collegeEmail: user.email,
        phone: user.phone,
        department: programs[Math.floor(Math.random() * programs.length)]._id,
        designation: faker.helpers.arrayElement(['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer']),
        campus: 'Main Campus',
        roleType: 'faculty',
        isActive: true,
        joiningDate: faker.date.past({ years: 10 }),
      });
    }
    users.push(user);
  }
  
  for (let i = 1; i <= 5; i++) {
    const email = `admin${i}@techspire.edu.np`;
    let user = await User.findOne({ email });
    
    if (!user) {
      user = await User.create({
        email,
        collegeEmail: email,
        passwordHash: adminPasswordHash,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        phone: faker.phone.number('98#########'),
        roles: ['super_admin'],
        activeRole: 'super_admin',
        isActive: true,
        isVerified: true,
        accountStatus: 'ACTIVE',
        passwordStatus: 'PERMANENT',
        mustChangePassword: false,
        lastLoginAt: new Date(),
      });
      
      await Staff.create({
        user: user._id,
        employeeId: `ADM${String(i).padStart(5, '0')}`,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        collegeEmail: user.email,
        phone: user.phone,
        department: null,
        designation: 'System Administrator',
        campus: 'Main Campus',
        roleType: 'admin',
        isActive: true,
        joiningDate: faker.date.past({ years: 5 }),
      });
    }
    users.push(user);
  }
  
  return users;
}

async function seedNotices(users, count) {
  console.log(`Seeding ${count} notices...`);
  
  const facultyUsers = users.filter(u => u.roles.includes('faculty') || u.roles.includes('super_admin'));
  
  for (let i = 1; i <= count; i++) {
    const category = NOTICE_CATEGORIES_ENUM[Math.floor(Math.random() * NOTICE_CATEGORIES_ENUM.length)];
    const author = facultyUsers[Math.floor(Math.random() * facultyUsers.length)];
    
    const title = faker.helpers.arrayElement([
      'Important Announcement Regarding Upcoming Exams',
      'New Course Registration Schedule Released',
      'Campus Holiday Notice',
      'Library Hours Extended During Exam Period',
      'Placement Drive Registration Open',
      'Scholarship Application Deadline Extended',
      'Network Maintenance Scheduled',
      'New Lab Equipment Installed',
      'Guest Lecture by Industry Expert',
      'Annual Cultural Festival Dates Announced',
    ]);
    
    await Notice.findOneAndUpdate(
      { title: `${title} - ${i}` },
      {
        title: `${title} - ${i}`,
        content: faker.lorem.paragraphs(3),
        category,
        authorUser: author._id,
        priority: faker.helpers.arrayElement(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
        targetRoles: ['ALL'],
        status: 'PUBLISHED',
        publishedAt: faker.date.recent({ days: 30 }),
        expiresAt: faker.date.future({ days: 30 }),
      },
      { upsert: true, new: true }
    );
    
    if (i % 20 === 0) {
      console.log(`  Created ${i} notices...`);
    }
  }
}

async function seedAttendanceSessions(courses, users, count) {
  console.log(`Seeding ${count} attendance sessions...`);
  
  const facultyUsers = users.filter(u => u.roles.includes('faculty'));
  
  for (let i = 1; i <= count; i++) {
    const course = courses[Math.floor(Math.random() * courses.length)];
    const faculty = facultyUsers[Math.floor(Math.random() * facultyUsers.length)];
    
    const sessionDate = faker.date.recent({ days: 60 });
    const dateStr = sessionDate.toISOString().split('T')[0];
    const startHour = 8 + Math.floor(Math.random() * 8);
    
    await AttendanceSession.findOneAndUpdate(
      { course: course._id, facultyUser: faculty._id, date: dateStr, startTime: `${startHour}:00` },
      {
        course: course._id,
        facultyUser: faculty._id,
        date: dateStr,
        startTime: `${startHour}:00`,
        endTime: `${startHour + 1}:30`,
        topic: faker.lorem.sentence(),
        semester: Math.floor(Math.random() * 8) + 1,
        classType: faker.helpers.arrayElement(['Lecture', 'Tutorial', 'Practical']),
        sessionName: 'Lecture',
        status: faker.helpers.arrayElement(['OPEN', 'CLOSED']),
        sectionCodes: ['A'],
        academicYear: '2024-2025',
        batches: ['Fall 2024'],
        createdBy: faculty._id,
      },
      { upsert: true, new: true }
    );
    
    if (i % 20 === 0) {
      console.log(`  Created ${i} attendance sessions...`);
    }
  }
}

async function runSeed() {
  try {
    const confirmed = await confirmSeeding();
    if (!confirmed) {
      console.log('Seeding cancelled. No changes made.');
      process.exit(0);
    }
    
    await connectDB();
    
    const programs = await seedPrograms();
    const courses = await seedCourses(programs);
    const batches = await seedBatches();
    const semesters = await seedSemesters();
    const feeCategories = await seedFeeCategories();
    
    const totalStudents = parseInt(process.env.STUDENT_COUNT) || 500;
    const users = await seedUsers(programs, batches, totalStudents);
    
    await seedNotices(users, 100);
    await seedAttendanceSessions(courses, users, 200);
    
    console.log('Seeding completed successfully!');
    console.log(`Total students: ${totalStudents}`);
    console.log(`Total faculty: 20`);
    console.log(`Total admins: 5`);
    console.log(`Total users: ${users.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

runSeed();