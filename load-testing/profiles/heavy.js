export const profile = {
  name: 'heavy',
  description: 'Heavy load test for production-like validation',
  targetVUs: 1000,
  duration: '20m',
  scenarios: {
    heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: 250 },
        { duration: '3m', target: 500 },
        { duration: '3m', target: 750 },
        { duration: '3m', target: 1000 },
        { duration: '5m', target: 1000 },
        { duration: '3m', target: 0 },
      ],
      exec: 'mixedScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<8000'],
    http_req_failed: ['rate<0.05'],
  },
};