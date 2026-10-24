import assert from "node:assert/strict";
import test from "node:test";
import {
  getNavSectionsForRole,
  getVisibleNavSectionsForRole,
  STANDARD_NAV_SECTIONS,
  STANDARD_NAV_SECTION_IDS,
  NavSectionId,
} from "./navigation";
import { UserRoleType } from "../types";

const ROLES: UserRoleType[] = [
  "super_admin",
  "campus_admin",
  "dean",
  "hod",
  "program_coordinator",
  "registrar",
  "exam_officer",
  "finance_officer",
  "faculty",
  "student",
  "parent",
];

test("defines exactly the five standard navigation sections", () => {
  assert.deepEqual(STANDARD_NAV_SECTION_IDS, [
    "core-academic",
    "people-enrolment",
    "administration-governance",
    "communication-engagement",
    "account-personal",
  ]);
  assert.equal(STANDARD_NAV_SECTIONS["core-academic"].titleEn, "Core Academic Management");
  assert.equal(STANDARD_NAV_SECTIONS["people-enrolment"].titleEn, "People & Enrolment");
  assert.equal(STANDARD_NAV_SECTIONS["administration-governance"].titleEn, "Administration & Governance");
  assert.equal(STANDARD_NAV_SECTIONS["communication-engagement"].titleEn, "Communication & Engagement");
  assert.equal(STANDARD_NAV_SECTIONS["account-personal"].titleEn, "Account & Personal");
  for (const id of STANDARD_NAV_SECTION_IDS) {
    assert.ok(STANDARD_NAV_SECTIONS[id].titleNe.length > 0, `${id} needs a Nepali label`);
  }
});

test("every role uses only the standard sections with authoritative titles", () => {
  for (const role of ROLES) {
    const sections = getNavSectionsForRole(role);
    assert.ok(sections.length > 0, `${role} has no navigation`);
    for (const section of sections) {
      assert.ok(
        (STANDARD_NAV_SECTION_IDS as string[]).includes(section.id),
        `${role} uses non-standard section ${section.id}`,
      );
      const standard = STANDARD_NAV_SECTIONS[section.id as NavSectionId];
      assert.equal(section.titleEn, standard.titleEn, `${role}/${section.id} titleEn drifted`);
      assert.equal(section.titleNe, standard.titleNe, `${role}/${section.id} titleNe drifted`);
      assert.ok(section.items.length > 0, `${role}/${section.id} is empty at configuration time`);
    }
  }
});

test("no role menu contains duplicate navigation ids", () => {
  for (const role of ROLES) {
    const ids = getNavSectionsForRole(role).flatMap((section) =>
      section.items.map((item) => item.id),
    );
    assert.equal(new Set(ids).size, ids.length, `${role} duplicates ids: ${ids.join(", ")}`);
  }
});

test("every item declares a valid permission when guarded", () => {
  for (const role of ROLES) {
    for (const item of getNavSectionsForRole(role).flatMap((s) => s.items)) {
      if (item.permission) {
        assert.ok(item.permission.includes("."), `${role}/${item.id} permission "${item.permission}" is not namespaced`);
      }
      assert.ok(item.labelEn.length > 0 && item.labelNe.length > 0, `${role}/${item.id} lacks labels`);
    }
  }
});

test("every role keeps Profile in Account & Personal", () => {
  for (const role of ROLES) {
    const account = getNavSectionsForRole(role).find((s) => s.id === "account-personal");
    assert.ok(account, `${role} has no Account & Personal section`);
    assert.ok(
      account.items.some((item) => item.id === "profile" && !item.permission),
      `${role} Profile must be permission-free`,
    );
  }
});

test("super admin sees all five sections in canonical order", () => {
  const allPermissions = new Set(
    getNavSectionsForRole("super_admin")
      .flatMap((section) => section.items)
      .flatMap((item) => (item.permission ? [item.permission] : [])),
  );
  const sections = getVisibleNavSectionsForRole("super_admin", allPermissions);
  assert.deepEqual(
    sections.map((section) => section.id),
    STANDARD_NAV_SECTION_IDS,
  );
  const itemIds = sections.flatMap((section) => section.items.map((item) => item.id));
  for (const expected of [
    "dashboard",
    "learning",
    "lms",
    "timetable_attendance",
    "calendar_documents",
    "examination",
    "students",
    "admissions",
    "attendance_sheet",
    "user_management",
    "finance",
    "facilities_library",
    "documents",
    "analytics",
    "communication",
    "messages",
    "notices",
    "requests",
    "profile",
  ]) {
    assert.ok(itemIds.includes(expected), `super admin menu is missing ${expected}`);
  }
});

test("students are not offered administrative or finance operations", () => {
  const allPermissions = new Set(
    getNavSectionsForRole("student")
      .flatMap((section) => section.items)
      .flatMap((item) => (item.permission ? [item.permission] : [])),
  );
  const sections = getVisibleNavSectionsForRole("student", allPermissions);
  const itemIds = sections.flatMap((section) => section.items.map((item) => item.id));
  for (const forbidden of ["user_management", "admissions", "analytics"]) {
    assert.ok(!itemIds.includes(forbidden), `student menu must not contain ${forbidden}`);
  }
  // Fees & Payments is a self-service view guarded by finance.invoice.view,
  // never an administrative finance workspace entry.
  const finance = sections
    .flatMap((section) => section.items)
    .find((item) => item.id === "finance");
  assert.equal(finance?.permission, "finance.invoice.view");
});

test("permission filtering drops unauthorized items and empty sections", () => {
  // A student that only holds mail.view keeps the always-visible
  // dashboard/profile plus the communication section only.
  const sections = getVisibleNavSectionsForRole("student", new Set(["mail.view"]));
  const ids = sections.map((section) => section.id);
  const coreAcademic = sections.find((section) => section.id === "core-academic");
  assert.deepEqual(
    coreAcademic?.items.map((item) => item.id),
    ["dashboard"],
    "only the permission-free dashboard survives in Core Academic Management",
  );
  assert.ok(!ids.includes("people-enrolment"), "attendance requires a permission and must be hidden");
  assert.ok(!ids.includes("administration-governance"), "all administration items require permissions and must be hidden");
  assert.ok(ids.includes("communication-engagement"), "mail.view keeps the communication section");
  assert.ok(ids.includes("account-personal"), "profile is always visible");
  const communication = sections.find((section) => section.id === "communication-engagement");
  assert.deepEqual(
    communication?.items.map((item) => item.id),
    ["communication"],
  );
});

test("duplicate ids across sections keep only the first occurrence", () => {
  const visible = getVisibleNavSectionsForRole("faculty", new Set(["attendance.view"]));
  // `attendance_sheet` appears once even though faculty has several
  // attendance-capable entries elsewhere in the menu.
  const occurrences = visible
    .flatMap((section) => section.items)
    .filter((item) => item.id === "attendance_sheet").length;
  assert.equal(occurrences, 1);
});

test("finance and examination permissions stay separate concerns", () => {
  const financeItems = getNavSectionsForRole("finance_officer")
    .flatMap((section) => section.items)
    .map((item) => item.permission);
  assert.ok(!financeItems.includes("exams.view"), "finance officer menu must not include examination pages");
  const examItems = getNavSectionsForRole("exam_officer")
    .flatMap((section) => section.items)
    .map((item) => item.permission);
  assert.ok(!examItems.includes("finance.invoice.view"), "exam officer menu must not include finance pages");
});

test("hod and program coordinator share the department portal", () => {
  assert.deepEqual(
    getNavSectionsForRole("hod").map((section) => section.id),
    getNavSectionsForRole("program_coordinator").map((section) => section.id),
  );
});
