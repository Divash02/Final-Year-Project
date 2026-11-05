import assert from "node:assert/strict";
import test from "node:test";
import {
  getNavSectionsForRole,
  getVisibleNavSectionsForRole,
  STANDARD_NAV_SECTIONS,
  STANDARD_NAV_SECTION_IDS,
  NavSectionId,
} from "./navigation";
import { resolveRoute, routeToView, viewToRoute } from "./appRoutes";
import { UserRoleType } from "../types";
import {
  getPermissionsForRoles,
  normalizeRoles,
} from "../../../backend/src/permissions/catalog.js";

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

test("defines exactly the seven standard navigation sections", () => {
  assert.deepEqual(STANDARD_NAV_SECTION_IDS, [
    "core-academic",
    "people-enrolment",
    "administration-governance",
    "people-workforce",
    "campus-learning-services",
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

test("Smart Document Centre route survives navigation and refresh", () => {
  const route = "/smart-documents";
  assert.equal(routeToView[route], "smart_documents");
  assert.equal(viewToRoute.smart_documents, route);
  assert.equal(resolveRoute(route).view, "smart_documents");
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

test("student My Documents opens the document centre under Administration & Governance", () => {
  const sections = getNavSectionsForRole("student");
  const administration = sections.find((section) => section.id === "administration-governance");
  const account = sections.find((section) => section.id === "account-personal");
  assert.ok(administration?.items.some((item) =>
    item.id === "smart_documents" && item.labelEn === "My Documents",
  ));
  assert.deepEqual(account?.items.map((item) => item.id), ["profile"]);
  const allItems = sections.flatMap((section) => section.items);
  assert.equal(allItems.filter((item) => item.labelEn === "My Documents").length, 1);
  assert.equal(allItems.some((item) =>
    ["notification_preferences", "security_sessions"].includes(item.id),
  ), false);
  assert.equal(viewToRoute.smart_documents, "/smart-documents");
});

test("super admin sees all seven sections and the complete admin navigation", () => {
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
  assert.deepEqual(
    sections.map((section) => section.titleEn),
    [
      "Core Academic Management",
      "People & Enrolment",
      "Administration & Governance",
      "People & Workforce",
      "Campus & Learning Services",
      "Communication & Engagement",
      "Account & Personal",
    ],
  );
  const sectionItems = Object.fromEntries(
    sections.map((section) => [
      section.id,
      section.items.map((item) => item.labelEn),
    ]),
  );
  assert.deepEqual(sectionItems["core-academic"], [
    "Institution Dashboard",
    "Courses & Curriculum",
    "Course Workspaces",
    "Timetable & Sessions",
    "Academic Calendar",
    "Examinations Suite",
    "Quizzes",
  ]);
  assert.deepEqual(sectionItems["people-enrolment"], [
    "Student Directory",
    "Admissions Workflow",
    "Attendance Records",
    "Student Lifecycle Management",
  ]);
  assert.deepEqual(sectionItems["administration-governance"], [
    "User & Role Management",
    "Finance & Invoices",
    "Analytics & Audit Logs",
    "AI Intelligence",
    "Workflow Automation",
    "Smart Document Centre",
  ]);
  assert.deepEqual(sectionItems["people-workforce"], ["HR Dashboard"]);
  assert.deepEqual(sectionItems["campus-learning-services"], [
    "Library",
    "Buildings & Classrooms",
    "Laboratories & Equipment",
    "Room Reservations",
    "Maintenance Management",
    "Assets & Inventory",
    "Transport Management",
  ]);
  assert.deepEqual(sectionItems["communication-engagement"], [
    "College Mail",
    "Messages",
    "Notices",
    "Requests & Cases",
  ]);
  assert.deepEqual(sectionItems["account-personal"], ["My Profile"]);

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
    "smart_documents",
    "analytics",
    "communication",
    "messages",
    "notices",
    "requests",
    "profile",
  ]) {
    assert.ok(itemIds.includes(expected), `super admin menu is missing ${expected}`);
  }

  const campusRoutes = {
    campus_buildings: "/campus/buildings",
    campus_labs: "/campus/laboratories",
    campus_reservations: "/campus/room-reservations",
    campus_maintenance: "/campus/maintenance",
    campus_assets: "/campus/assets",
    campus_transport: "/campus/transport",
  };
  for (const [view, route] of Object.entries(campusRoutes)) {
    assert.equal(routeToView[route], view);
    assert.equal(viewToRoute[view], route);
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

test("admin roles receive campus links from their actual permission grants", () => {
  const campusRoutes = {
    campus_buildings: "/campus/buildings",
    campus_labs: "/campus/laboratories",
    campus_reservations: "/campus/room-reservations",
    campus_maintenance: "/campus/maintenance",
    campus_assets: "/campus/assets",
    campus_transport: "/campus/transport",
  };

  assert.equal(new Set(Object.values(campusRoutes)).size, 6);

  const adminRoleCases = [
    { name: "Super Admin", role: "super_admin", grants: ["super_admin"] },
    {
      name: "College Admin (legacy institution_admin)",
      role: "super_admin",
      grants: normalizeRoles(["institution_admin"]),
    },
    { name: "Campus Admin", role: "campus_admin", grants: ["campus_admin"] },
  ] as const;

  for (const admin of adminRoleCases) {
    const permissions = getPermissionsForRoles([...admin.grants]);
    const sections = getVisibleNavSectionsForRole(admin.role, permissions);
    const campusSection = sections.find(
      (section) => section.id === "campus-learning-services",
    );
    const labels = campusSection?.items.map((item) => item.labelEn) || [];
    for (const label of [
      "Library",
      "Buildings & Classrooms",
      "Laboratories & Equipment",
      "Room Reservations",
      "Maintenance Management",
      "Assets & Inventory",
      "Transport Management",
    ]) {
      assert.ok(labels.includes(label), `${admin.name} sidebar is missing ${label}`);
    }

    const items = sections.flatMap((section) => section.items);
    assert.ok(
      !items.some((item) => item.id === "facilities_library"),
      `${admin.name} sidebar should not include Campus & Facilities`,
    );
    for (const [view, route] of Object.entries(campusRoutes)) {
      assert.ok(
        items.some((item) => item.id === view),
        `${admin.name} sidebar is missing ${view}`,
      );
      assert.equal(routeToView[route], view, `${route} must resolve to ${view}`);
      assert.equal(viewToRoute[view], route, `${view} must navigate to ${route}`);
      assert.equal(resolveRoute(route).view, view, `refreshing ${route} must keep its page`);
    }
    assert.equal(
      new Set(Object.keys(campusRoutes).map((view) => resolveRoute(viewToRoute[view]).view)).size,
      6,
    );
  }
});

test("a user without facilities permission does not receive campus management links", () => {
  const sections = getVisibleNavSectionsForRole(
    "super_admin",
    getPermissionsForRoles(["super_admin"]).filter(
      (permission) => permission !== "facilities.view",
    ),
  );
  const items = sections.flatMap((section) => section.items);

  for (const id of [
    "campus_buildings",
    "campus_labs",
    "campus_reservations",
    "campus_maintenance",
    "campus_assets",
    "campus_transport",
  ]) {
    assert.ok(!items.some((item) => item.id === id), `${id} must be permission-gated`);
  }
});

test("hod and program coordinator share the department portal", () => {
  assert.deepEqual(
    getNavSectionsForRole("hod").map((section) => section.id),
    getNavSectionsForRole("program_coordinator").map((section) => section.id),
  );
});
