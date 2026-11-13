import http from 'k6/http';
import { login, randomPause, shortPause, checkResponse, getAuthHeaders, ENDPOINTS, METRICS, getRandomFacultyAccount, logout } from '../common.js';

export function facultyLoginFlow() {
  const account = getRandomFacultyAccount();
  const auth = login(account.email, account.password);
  
  if (!auth) return null;
  
  randomPause();
  return auth;
}

export function facultyDashboardFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.dashboard.summary}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.facultyDashboardDuration.add(duration);
  
  checkResponse(res);
  shortPause();
}

export function facultyMailFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.mail.inbox}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.mailInboxDuration.add(duration);
  
  checkResponse(res);
  randomPause();
  
  const recipientsRes = http.get(`${BASE_URL}${ENDPOINTS.mail.recipients}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(recipientsRes);
}

export function facultyAttendanceFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const contextRes = http.get(`${BASE_URL}${ENDPOINTS.attendance.context}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.attendanceDuration.add(duration);
  
  checkResponse(contextRes);
  shortPause();
  
  const rosterRes = http.get(`${BASE_URL}${ENDPOINTS.attendance.roster}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(rosterRes);
  shortPause();
  
  const sessionsRes = http.get(`${BASE_URL}${ENDPOINTS.attendance.sessions}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(sessionsRes);
}

export function facultyTimetableFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.timetable.list}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.timetableDuration.add(duration);
  
  checkResponse(res);
  randomPause();
  
  const filtersRes = http.get(`${BASE_URL}${ENDPOINTS.timetable.filters}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(filtersRes);
}

export function facultyAssignmentsFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.assignments.list}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.assignmentsDuration.add(duration);
  
  checkResponse(res);
  shortPause();
  
  const optionsRes = http.get(`${BASE_URL}${ENDPOINTS.assignments.options}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(optionsRes);
}

export function facultyExamsFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.exams.facultyUpcoming}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.examsDuration.add(duration);
  
  checkResponse(res);
  shortPause();
  
  const dashboardRes = http.get(`${BASE_URL}${ENDPOINTS.exams.dashboard}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(dashboardRes);
  shortPause();
  
  const calendarRes = http.get(`${BASE_URL}${ENDPOINTS.exams.calendar}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(calendarRes);
}

export function facultyNoticesFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.notices.list}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.noticesDuration.add(duration);
  
  checkResponse(res);
}

export function facultyProfileFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.profile.me}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.profileDuration.add(duration);
  
  checkResponse(res);
}

export function facultyFullFlow() {
  const auth = facultyLoginFlow();
  if (!auth) return;
  
  facultyDashboardFlow(auth);
  facultyMailFlow(auth);
  facultyAttendanceFlow(auth);
  facultyTimetableFlow(auth);
  facultyAssignmentsFlow(auth);
  facultyExamsFlow(auth);
  facultyNoticesFlow(auth);
  facultyProfileFlow(auth);
  
  logout(auth.token, auth.csrfToken);
}