export const profile = {
  name: 'soak',
  description: 'Long-running soak test for stability validation (30 min at 1000 VUs)',
  targetVUs: 1000,
  duration: '30m',
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '30m',
      exec: 'mixedScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<8000'],
    http_req_failed: ['rate<0.05'],
  },
};