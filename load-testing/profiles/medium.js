export const profile = {
  name: 'medium',
  description: 'Medium load test for staging validation',
  targetVUs: 500,
  duration: '15m',
  scenarios: {
    medium: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: 100 },
        { duration: '3m', target: 250 },
        { duration: '3m', target: 500 },
        { duration: '4m', target: 500 },
        { duration: '2m', target: 0 },
      ],
      exec: 'mixedScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.03'],
  },
};