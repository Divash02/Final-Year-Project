export const profile = {
  name: 'stress-5000',
  description: 'Stress test at 5,000 concurrent users',
  targetVUs: 5000,
  duration: '30m',
  scenarios: {
    stress_5000: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: 1000 },
        { duration: '3m', target: 2000 },
        { duration: '3m', target: 3000 },
        { duration: '3m', target: 4000 },
        { duration: '3m', target: 5000 },
        { duration: '10m', target: 5000 },
        { duration: '5m', target: 0 },
      ],
      exec: 'mixedScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<8000', 'p(99)<20000'],
    http_req_failed: ['rate<0.15'],
  },
};