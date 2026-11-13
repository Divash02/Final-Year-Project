export const profile = {
  name: 'stress-10000',
  description: 'Maximum stress test at 10,000 concurrent users - target production capacity',
  targetVUs: 10000,
  duration: '40m',
  scenarios: {
    stress_10000: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 2000 },
        { duration: '5m', target: 4000 },
        { duration: '5m', target: 6000 },
        { duration: '5m', target: 8000 },
        { duration: '5m', target: 10000 },
        { duration: '10m', target: 10000 },
        { duration: '5m', target: 0 },
      ],
      exec: 'mixedScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<10000', 'p(99)<30000'],
    http_req_failed: ['rate<0.20'],
  },
};