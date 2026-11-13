import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, METRICS, THRESHOLDS, getRandomStudentAccount, getRandomFacultyAccount, getRandomAdminAccount, login, logout, getAuthHeaders, checkResponse, randomPause, shortPause, ENDPOINTS } from './common.js';
import { studentFullFlow } from './scenarios/student-flows.js';
import { facultyFullFlow } from './scenarios/faculty-flows.js';
import { adminFullFlow } from './scenarios/admin-flows.js';

import smokeProfile from './profiles/smoke.js';
import lightProfile from './profiles/light.js';
import mediumProfile from './profiles/medium.js';
import heavyProfile from './profiles/heavy.js';
import stress2500Profile from './profiles/stress-2500.js';
import stress5000Profile from './profiles/stress-5000.js';
import stress10000Profile from './profiles/stress-10000.js';
import soakProfile from './profiles/soak.js';
import spikeProfile from './profiles/spike.js';

const USER_DISTRIBUTION = {
  students: 0.70,
  faculty: 0.20,
  admins: 0.10,
};

const PROFILES = {
  smoke: smokeProfile,
  light: lightProfile,
  medium: mediumProfile,
  heavy: heavyProfile,
  'stress-2500': stress2500Profile,
  'stress-5000': stress5000Profile,
  'stress-10000': stress10000Profile,
  soak: soakProfile,
  spike: spikeProfile,
};

const scenarioName = __ENV.SCENARIO || 'smoke';
const selectedProfile = PROFILES[scenarioName];

export const options = selectedProfile
  ? {
      scenarios: selectedProfile.scenarios,
      thresholds: { ...THRESHOLDS, ...selectedProfile.thresholds },
      discardResponseBodies: true,
      summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
    }
  : {
      thresholds: THRESHOLDS,
      discardResponseBodies: true,
      summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
    };

export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);
  console.log(`Scenario: ${scenarioName}`);
  if (selectedProfile) {
    console.log(`Profile: ${selectedProfile.description}`);
    console.log(`Target VUs: ${selectedProfile.targetVUs}`);
    console.log(`Duration: ${selectedProfile.duration}`);
  }
  
  const healthCheck = http.get(`${BASE_URL}/api/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`Health check failed: ${healthCheck.status}`);
  }
  
  return { baseUrl: BASE_URL };
}

export function mixedScenario() {
  const rand = Math.random();
  
  if (rand < USER_DISTRIBUTION.students) {
    studentFullFlow();
  } else if (rand < USER_DISTRIBUTION.students + USER_DISTRIBUTION.faculty) {
    facultyFullFlow();
  } else {
    adminFullFlow();
  }
}

export function studentScenario() {
  studentFullFlow();
}

export function facultyScenario() {
  facultyFullFlow();
}

export function adminScenario() {
  adminFullFlow();
}

export function teardown(data) {
  console.log('Load test completed');
  console.log(`Base URL: ${data.baseUrl}`);
}