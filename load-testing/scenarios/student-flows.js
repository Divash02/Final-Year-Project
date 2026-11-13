import http from 'k6/http';
import { login, randomPause, shortPause, checkResponse, getAuthHeaders, ENDPOINTS, METRICS, getRandomStudentAccount, logout } from '../common.js';

export function studentLoginFlow() {
  const account = getRandomStudentAccount();
  const auth = login(account.email, account.password);
  
  if (!auth) return null;
  
  randomPause();
  return auth;
}

export function studentDashboardFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.dashboard.summary}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.dashboardDuration.add(duration);
  
  checkResponse(res);
  shortPause();
}

export function studentMailInboxFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.mail.inbox}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.mailInboxDuration.add(duration);
  
  checkResponse(res);
  randomPause();
  
  const sentRes = http.get(`${BASE_URL}${ENDPOINTS.mail.sent}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(sentRes);
  shortPause();
  
  const draftsRes = http.get(`${BASE_URL}${ENDPOINTS.mail.drafts}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(draftsRes);
}

export function studentAttendanceFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const contextRes = http.get(`${BASE_URL}${ENDPOINTS.attendance.context}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.attendanceDuration.add(duration);
  
  checkResponse(contextRes);
  shortPause();
  
  const recordsRes = http.get(`${BASE_URL}${ENDPOINTS.attendance.records}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(recordsRes);
  shortPause();
  
  const currentSessionRes = http.get(`${BASE_URL}${ENDPOINTS.attendance.currentSession}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(currentSessionRes);
}

export function studentTimetableFlow(auth) {
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

export function studentAssignmentsFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.assignments.list}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.assignmentsDuration.add(duration);
  
  checkResponse(res);
  shortPause();
  
  const submissionsRes = http.get(`${BASE_URL}${ENDPOINTS.assignments.submissions}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(submissionsRes);
}

export function studentExamsFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.exams.studentUpcoming}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.examsDuration.add(duration);
  
  checkResponse(res);
  shortPause();
  
  const calendarRes = http.get(`${BASE_URL}${ENDPOINTS.exams.calendar}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(calendarRes);
  shortPause();
  
  const dashboardRes = http.get(`${BASE_URL}${ENDPOINTS.exams.dashboard}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(dashboardRes);
}

export function studentFeesFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.fees.invoices}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.feesDuration.add(duration);
  
  checkResponse(res);
  shortPause();
  
  const paymentsRes = http.get(`${BASE_URL}${ENDPOINTS.fees.payments}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(paymentsRes);
}

export function studentNoticesFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.notices.list}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.noticesDuration.add(duration);
  
  checkResponse(res);
}

export function studentProfileFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.profile.me}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.profileDuration.add(duration);
  
  checkResponse(res);
  shortPause();
  
  const notificationsRes = http.get(`${BASE_URL}${ENDPOINTS.notifications.list}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(notificationsRes);
}

export function studentFullFlow() {
  const auth = studentLoginFlow();
  if (!auth) return;
  
  studentDashboardFlow(auth);
  studentMailInboxFlow(auth);
  studentAttendanceFlow(auth);
  studentTimetableFlow(auth);
  studentAssignmentsFlow(auth);
  studentExamsFlow(auth);
  studentFeesFlow(auth);
  studentNoticesFlow(auth);
  studentProfileFlow(auth);
  
  logout(auth.token, auth.csrfToken);
}