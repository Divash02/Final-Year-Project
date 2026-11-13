export const profile = {
  name: 'smoke',
  description: 'Quick smoke test with minimal load',
  targetVUs: 10,
  duration: '2m',
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 10,
      duration: '2m',
      exec: 'mixedScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};