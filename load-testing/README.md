# CollegeOS Load Testing Infrastructure

Comprehensive load testing setup for CollegeOS using **Grafana k6**, designed to validate performance up to **10,000 concurrent users**.

## 📁 Directory Structure

```
load-testing/
├── main.js                    # Main k6 test entry point
├── common.js                  # Shared utilities, metrics, endpoints, test accounts
├── run.js                     # Test runner with profile support
├── package.json               # Node dependencies for seeding/reporting
├── profiles/                  # Concurrency profiles
│   ├── smoke.js              # 10 VUs - Quick validation
│   ├── light.js              # 100 VUs - Development
│   ├── medium.js             # 500 VUs - Staging
│   ├── heavy.js              # 1,000 VUs - Production-like
│   ├── stress-2500.js        # 2,500 VUs - Stress
│   ├── stress-5000.js        # 5,000 VUs - Heavy stress
│   ├── stress-10000.js       # 10,000 VUs - Maximum capacity
│   ├── soak.js               # 1,000 VUs for 30 min - Stability
│   └── spike.js              # Burst to 2x - Spike handling
├── scenarios/                # User flow scenarios
│   ├── student-flows.js      # 9 student flows
│   ├── faculty-flows.js      # 8 faculty flows
│   └── admin-flows.js        # 8 admin flows
├── scripts/
│   ├── seed-data.js          # Database seeding (5000 students, 20 faculty, 5 admins)
│   └── generate-report.js    # HTML/Text report generator
├── data/                     # Test data files (generated)
└── reports/                  # Test reports (generated)
```

## 🎯 12 User Flows Tested

### Student Flows (70% of traffic)
1. **Student Login** - JWT authentication with session management
2. **Student Dashboard** - Analytics summary + personal dashboard
3. **Mail Inbox** - Inbox, sent, drafts folders
4. **Attendance** - Context, records, current session
5. **Timetable** - Student view + weekly view
6. **Assignments** - List + submissions
7. **Exams** - Upcoming + calendar + dashboard
8. **Fees** - Invoices + payments + summary
9. **Notices** - Published notices list
10. **Profile** - Profile + notifications

### Faculty Flows (20% of traffic)
1. **Faculty Login** - JWT authentication
2. **Faculty Dashboard** - Teaching dashboard + analytics
3. **Mail** - Inbox + recipient suggestions
4. **Attendance** - Context + roster + sessions
5. **Timetable** - Faculty view + weekly
6. **Assignments** - Teaching assignments + options
7. **Exams** - Upcoming + dashboard + calendar
8. **Notices** - Published notices
9. **Profile** - Profile management

### Admin Flows (10% of traffic)
1. **Admin Login** - Super admin authentication
2. **Admin Dashboard** - System-wide analytics
3. **User Management** - Users, roles, permissions
4. **Academics** - Programs, courses, batches, semesters
5. **Attendance** - System-wide sessions + records
6. **Finance** - Invoices, payments, summary, categories
7. **Notices** - Management + categories
8. **Messages** - Conversations + contacts
9. **Settings** - General, security, email

## 🚀 Quick Start

### Prerequisites
- **k6** installed (`brew install k6` / `choco install k6` / download from k6.io)
- **Node.js 18+** for seeding and reporting
- **CollegeOS backend** running on `http://localhost:4000`
- **MongoDB** for test data seeding

### Installation

```bash
cd load-testing
npm install
```

### Seed Test Data

```bash
# Development (100 students)
npm run seed:dev

# Full dataset (5000 students, 20 faculty, 5 admins)
npm run seed:full

# Custom count
STUDENT_COUNT=10000 node scripts/seed-data.js
```

### Run Load Tests

```bash
# Quick smoke test (10 VUs, 2 min)
npm run test:smoke

# Light load (100 VUs, 10 min)
npm run test:light

# Medium load (500 VUs, 15 min)
npm run test:medium

# Heavy load (1,000 VUs, 20 min)
npm run test:heavy

# Stress tests
npm run test:stress-2500   # 2,500 VUs
npm run test:stress-5000   # 5,000 VUs
npm run test:stress-10000  # 10,000 VUs (target capacity)

# Specialized tests
npm run test:soak          # 30 min stability
npm run test:spike         # Burst handling

# Using the runner (more options)
node run.js smoke
node run.js heavy --base-url http://staging.collegeos.edu.np:4000
node run.js stress-10000 --output /tmp/results
node run.js custom --vus 500 --duration 10m
```

## 📊 Performance Thresholds

| Metric | Smoke | Light | Medium | Heavy | Stress-10K |
|--------|-------|-------|--------|-------|------------|
| HTTP p(95) | <1s | <1.5s | <2s | <3s | <10s |
| HTTP p(99) | <2s | <3s | <5s | <8s | <30s |
| Error Rate | <1% | <2% | <3% | <5% | <20% |
| Login p(95) | <1s | <1s | <1s | <1s | <2s |
| Dashboard p(95) | <1.5s | <1.5s | <1.5s | <2s | <5s |

## 📈 Reports

After each test, reports are generated in `reports/`:
- **JSON** - Raw k6 metrics for CI/CD integration
- **Text** - Human-readable summary with threshold evaluation
- **HTML** - Visual report with color-coded pass/fail

```bash
# Generate report from existing JSON
node scripts/generate-report.js reports/result.json reports/report.txt reports/report.html
```

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:4000` | Backend API base URL |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL |
| `TARGET_VUS` | Profile default | Virtual users (overrides profile) |
| `SCENARIO` | Profile default | Scenario name |
| `MONGODB_URI` | `mongodb://localhost:27017/collegeos` | Database for seeding |
| `STUDENT_COUNT` | `500` | Number of students to seed |

### Custom Test Accounts

Edit `common.js` to modify test accounts:
```javascript
export const TEST_ACCOUNTS = {
  students: [...],  // 100 default accounts
  faculty: [...],   // 20 default accounts
  admins: [...],    // 5 default accounts
};
```

## 🔧 CI/CD Integration

### GitHub Actions Example

```yaml
name: Load Test
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:
    inputs:
      profile:
        type: choice
        options: [smoke, light, medium, heavy, stress-10000]
        default: medium

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install k6
        run: sudo apt-get install -y k6
      - name: Run Load Test
        run: |
          cd load-testing
          npm install
          npm run seed:dev
          npm run test:${{ github.event.inputs.profile || 'medium' }}
      - name: Upload Reports
        uses: actions/upload-artifact@v4
        with:
          name: load-test-reports
          path: load-testing/reports/
```

## 📝 Adding Custom Scenarios

1. Create new scenario in `scenarios/`
2. Import in `main.js`
3. Add to mixed scenario distribution
4. Define metrics in `common.js`
5. Add thresholds in `THRESHOLDS`

## 🐛 Troubleshooting

### Common Issues

**Connection refused**
- Ensure backend is running on `BASE_URL`
- Check firewall/network policies

**High error rate**
- Check backend logs for 5xx errors
- Verify database connection pool size
- Ensure test accounts exist (run seeding)

**Out of memory (10K VUs)**
- Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096"`
- Use k6 `--compatibility-mode=base`
- Consider distributed execution

**CSRF token errors**
- Backend must return `csrfToken` in login response
- Check `X-CSRF-Token` header is sent

## 📚 Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Thresholds](https://k6.io/docs/using-k6/thresholds/)
- [k6 Scenarios](https://k6.io/docs/using-k6/scenarios/)
- [CollegeOS API Docs](../docs/api.md)

## 📄 License

MIT License - Part of CollegeOS Project