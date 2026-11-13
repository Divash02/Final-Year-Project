import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
export const FRONTEND_URL = __ENV.FRONTEND_URL || 'http://localhost:3000';

export const METRICS = {
  loginDuration: new Trend('login_duration'),
  dashboardDuration: new Trend('dashboard_duration'),
  mailInboxDuration: new Trend('mail_inbox_duration'),
  attendanceDuration: new Trend('attendance_duration'),
  timetableDuration: new Trend('timetable_duration'),
  assignmentsDuration: new Trend('assignments_duration'),
  examsDuration: new Trend('exams_duration'),
  feesDuration: new Trend('fees_duration'),
  noticesDuration: new Trend('notices_duration'),
  profileDuration: new Trend('profile_duration'),
  facultyDashboardDuration: new Trend('faculty_dashboard_duration'),
  adminDashboardDuration: new Trend('admin_dashboard_duration'),
  
  loginErrors: new Counter('login_errors'),
  dashboardErrors: new Counter('dashboard_errors'),
  mailInboxErrors: new Counter('mail_inbox_errors'),
  attendanceErrors: new Counter('attendance_errors'),
  timetableErrors: new Counter('timetable_errors'),
  assignmentsErrors: new Counter('assignments_errors'),
  examsErrors: new Counter('exams_errors'),
  feesErrors: new Counter('fees_errors'),
  noticesErrors: new Counter('notices_errors'),
  profileErrors: new Counter('profile_errors'),
  facultyDashboardErrors: new Counter('faculty_dashboard_errors'),
  adminDashboardErrors: new Counter('admin_dashboard_errors'),
  
  httpErrors: new Rate('http_errors'),
  loginSuccess: new Rate('login_success'),
};

export const TEST_ACCOUNTS = {
  students: Array.from({ length: 100 }, (_, i) => ({
    email: `student${i + 1}@techspire.edu.np`,
    password: 'StudentPass123!',
    role: 'student',
  })),
  faculty: Array.from({ length: 20 }, (_, i) => ({
    email: `faculty${i + 1}@techspire.edu.np`,
    password: 'FacultyPass123!',
    role: 'faculty',
  })),
  admins: Array.from({ length: 5 }, (_, i) => ({
    email: `admin${i + 1}@techspire.edu.np`,
    password: 'AdminPass123!',
    role: 'super_admin',
  })),
};

export function getAuthHeaders(token, csrfToken) {
  return {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-CSRF-Token': csrfToken || '',
      'Content-Type': 'application/json',
    },
  };
}

export function login(email, password) {
  const start = new Date();
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'login' },
  });
  
  const duration = new Date() - start;
  METRICS.loginDuration.add(duration);
  
  const success = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.token !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  if (success) {
    METRICS.loginSuccess.add(1);
    const body = JSON.parse(res.body);
    return { token: body.token, csrfToken: body.csrfToken, user: body.user };
  } else {
    METRICS.loginErrors.add(1);
    METRICS.httpErrors.add(1);
    return null;
  }
}

export function logout(token, csrfToken) {
  return http.post(`${BASE_URL}/api/auth/logout`, null, getAuthHeaders(token, csrfToken));
}

export function sleepWithJitter(minMs, maxMs) {
  const ms = Math.random() * (maxMs - minMs) + minMs;
  sleep(ms / 1000);
}

export function randomPause() {
  sleepWithJitter(500, 2000);
}

export function longPause() {
  sleepWithJitter(2000, 5000);
}

export function shortPause() {
  sleepWithJitter(100, 500);
}

export function checkResponse(res, expectedStatus = 200) {
  const success = check(res, {
    [`status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    'response has body': (r) => r.body && r.body.length > 0,
  });
  
  if (!success) {
    METRICS.httpErrors.add(1);
  }
  return success;
}

export const ENDPOINTS = {
  auth: {
    login: '/api/auth/login',
    me: '/api/auth/me',
    logout: '/api/auth/logout',
    sessions: '/api/auth/sessions',
    renew: '/api/auth/sessions/renew',
    changePassword: '/api/auth/change-password',
    activeRole: '/api/auth/active-role',
  },
  profile: {
    me: '/api/profile/me',
    notifications: '/api/profile/notifications',
    avatar: '/api/profile/avatar',
    signature: '/api/users/me/signature',
  },
  mail: {
    inbox: '/api/mail?folder=inbox',
    sent: '/api/mail?folder=sent',
    drafts: '/api/mail?folder=drafts',
    starred: '/api/mail?folder=starred',
    trash: '/api/mail?folder=trash',
    recipients: '/api/mail/recipients/suggest',
    send: '/api/mail',
  },
  attendance: {
    context: '/api/attendance/context',
    roster: '/api/attendance/roster',
    records: '/api/attendance',
    sessions: '/api/attendance/sessions',
    currentSession: '/api/attendance/sessions/current',
  },
  timetable: {
    list: '/api/timetable',
    filters: '/api/timetable/filters',
  },
  assignments: {
    list: '/api/assignments',
    submissions: '/api/submissions/mine',
    options: '/api/assignments/options/teaching',
  },
  exams: {
    list: '/api/exams',
    studentUpcoming: '/api/student/exams/upcoming',
    facultyUpcoming: '/api/faculty/exams/upcoming',
    dashboard: '/api/exams/dashboard-summary',
    calendar: '/api/exams/calendar',
  },
  fees: {
    invoices: '/api/invoices',
    payments: '/api/payments',
  },
  notices: {
    list: '/api/notices',
  },
  notifications: {
    list: '/api/notifications',
    unreadCount: '/api/notifications/unread-count',
  },
  messages: {
    conversations: '/api/messages',
    contacts: '/api/messages/contacts',
  },
  dashboard: {
    summary: '/api/dashboard/summary',
  },
  admin: {
    users: '/api/admin/users?page=1&limit=50',
    roles: '/api/administration/roles',
    permissions: '/api/administration/permissions',
    programs: '/api/administration/academics/programs',
    courses: '/api/administration/academics/courses',
    batches: '/api/administration/academics/batches',
    semesters: '/api/administration/academics/semesters',
    financeCategories: '/api/finance/categories',
    noticeCategories: '/api/notices/categories',
    settingsGeneral: '/api/administration/settings/general',
    settingsSecurity: '/api/administration/settings/security',
    settingsEmail: '/api/administration/settings/email',
    messages: '/api/messages',
    contacts: '/api/messages/contacts',
  },
};

export const THRESHOLDS = {
  http_req_duration: ['p(95)<2000', 'p(99)<5000'],
  http_req_failed: ['rate<0.05'],
  login_duration: ['p(95)<1000'],
  dashboard_duration: ['p(95)<1500'],
  mail_inbox_duration: ['p(95)<1000'],
  attendance_duration: ['p(95)<1500'],
  timetable_duration: ['p(95)<1000'],
  assignments_duration: ['p(95)<1500'],
  exams_duration: ['p(95)<1500'],
  fees_duration: ['p(95)<1000'],
  notices_duration: ['p(95)<1000'],
  profile_duration: ['p(95)<800'],
  faculty_dashboard_duration: ['p(95)<2000'],
  admin_dashboard_duration: ['p(95)<3000'],
};

export function selectRandomAccount(role) {
  const accounts = TEST_ACCOUNTS[role] || TEST_ACCOUNTS.students;
  return accounts[Math.floor(Math.random() * accounts.length)];
}

export function getRandomStudentAccount() {
  return selectRandomAccount('students');
}

export function getRandomFacultyAccount() {
  return selectRandomAccount('faculty');
}

export function getRandomAdminAccount() {
  return selectRandomAccount('admins');
}