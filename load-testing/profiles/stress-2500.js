export const profile = {
  name: 'stress-2500',
  description: 'Stress test at 2,500 concurrent users',
  targetVUs: 2500,
  duration: '25m',
  scenarios: {
    stress_2500: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: 500 },
        { duration: '3m', target: 1000 },
        { duration: '3m', target: 1500 },
        { duration: '3m', target: 2000 },
        { duration: '3m', target: 2500 },
        { duration: '5m', target: 2500 },
        { duration: '5m', target: 0 },
      ],
      exec: 'mixedScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<15000'],
    http_req_failed: ['rate<0.10'],
  },
};