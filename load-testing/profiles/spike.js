export const profile = {
  name: 'spike',
  description: 'Spike test - sudden burst to 2x normal load',
  targetVUs: 2000,
  duration: '10m',
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 1000 },
        { duration: '3m', target: 1000 },
        { duration: '30s', target: 2000 },
        { duration: '2m', target: 2000 },
        { duration: '30s', target: 1000 },
        { duration: '2m', target: 1000 },
        { duration: '1m', target: 0 },
      ],
      exec: 'mixedScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<15000'],
    http_req_failed: ['rate<0.10'],
  },
};