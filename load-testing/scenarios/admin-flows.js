import http from 'k6/http';
import { login, randomPause, shortPause, checkResponse, getAuthHeaders, ENDPOINTS, METRICS, getRandomAdminAccount, logout } from '../common.js';

export function adminLoginFlow() {
  const account = getRandomAdminAccount();
  const auth = login(account.email, account.password);
  
  if (!auth) return null;
  
  randomPause();
  return auth;
}

export function adminDashboardFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.dashboard.summary}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.adminDashboardDuration.add(duration);
  
  checkResponse(res);
  shortPause();
}

export function adminUsersFlow(auth) {
  if (!auth) return;
  
  const usersRes = http.get(`${BASE_URL}${ENDPOINTS.admin.users}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(usersRes);
  shortPause();
  
  const rolesRes = http.get(`${BASE_URL}${ENDPOINTS.admin.roles}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(rolesRes);
  shortPause();
  
  const permissionsRes = http.get(`${BASE_URL}${ENDPOINTS.admin.permissions}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(permissionsRes);
}

export function adminAcademicsFlow(auth) {
  if (!auth) return;
  
  const programsRes = http.get(`${BASE_URL}${ENDPOINTS.admin.programs}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(programsRes);
  shortPause();
  
  const coursesRes = http.get(`${BASE_URL}${ENDPOINTS.admin.courses}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(coursesRes);
  shortPause();
  
  const batchesRes = http.get(`${BASE_URL}${ENDPOINTS.admin.batches}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(batchesRes);
  shortPause();
  
  const semestersRes = http.get(`${BASE_URL}${ENDPOINTS.admin.semesters}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(semestersRes);
}

export function adminAttendanceFlow(auth) {
  if (!auth) return;
  
  const contextRes = http.get(`${BASE_URL}${ENDPOINTS.attendance.context}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(contextRes);
  shortPause();
  
  const sessionsRes = http.get(`${BASE_URL}${ENDPOINTS.attendance.sessions}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(sessionsRes);
  shortPause();
  
  const recordsRes = http.get(`${BASE_URL}${ENDPOINTS.attendance.records}?page=1&limit=50`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(recordsRes);
}

export function adminFeesFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const invoicesRes = http.get(`${BASE_URL}${ENDPOINTS.fees.invoices}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.feesDuration.add(duration);
  
  checkResponse(invoicesRes);
  shortPause();
  
  const paymentsRes = http.get(`${BASE_URL}${ENDPOINTS.fees.payments}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(paymentsRes);
  shortPause();
  
  const categoriesRes = http.get(`${BASE_URL}${ENDPOINTS.admin.financeCategories}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(categoriesRes);
}

export function adminNoticesFlow(auth) {
  if (!auth) return;
  
  const start = new Date();
  const res = http.get(`${BASE_URL}${ENDPOINTS.notices.list}`, getAuthHeaders(auth.token, auth.csrfToken));
  const duration = new Date() - start;
  METRICS.noticesDuration.add(duration);
  
  checkResponse(res);
  shortPause();
  
  const categoriesRes = http.get(`${BASE_URL}${ENDPOINTS.admin.noticeCategories}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(categoriesRes);
}

export function adminMessagesFlow(auth) {
  if (!auth) return;
  
  const conversationsRes = http.get(`${BASE_URL}${ENDPOINTS.messages.conversations}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(conversationsRes);
  shortPause();
  
  const contactsRes = http.get(`${BASE_URL}${ENDPOINTS.messages.contacts}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(contactsRes);
}

export function adminSettingsFlow(auth) {
  if (!auth) return;
  
  const generalRes = http.get(`${BASE_URL}${ENDPOINTS.admin.settingsGeneral}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(generalRes);
  shortPause();
  
  const securityRes = http.get(`${BASE_URL}${ENDPOINTS.admin.settingsSecurity}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(securityRes);
  shortPause();
  
  const emailRes = http.get(`${BASE_URL}${ENDPOINTS.admin.settingsEmail}`, getAuthHeaders(auth.token, auth.csrfToken));
  checkResponse(emailRes);
}

export function adminFullFlow() {
  const auth = adminLoginFlow();
  if (!auth) return;
  
  adminDashboardFlow(auth);
  adminUsersFlow(auth);
  adminAcademicsFlow(auth);
  adminAttendanceFlow(auth);
  adminFeesFlow(auth);
  adminNoticesFlow(auth);
  adminMessagesFlow(auth);
  adminSettingsFlow(auth);
  
  logout(auth.token, auth.csrfToken);
}