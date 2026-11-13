export const profile = {
  name: 'light',
  description: 'Light load test for development validation',
  targetVUs: 100,
  duration: '10m',
  scenarios: {
    light: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '4m', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '2m', target: 0 },
      ],
      exec: 'mixedScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.02'],
  },
};