const fs = require('fs');
const path = require('path');

function parseK6Json(filePath) {
  const data = fs.readFileSync(filePath, 'utf-8');
  const lines = data.trim().split('\n');
  
  const metrics = {
    http_req_duration: { values: [], count: 0 },
    http_req_failed: { values: [], count: 0 },
    http_reqs: { count: 0 },
    vus: { values: [] },
    iterations: { count: 0 },
    login_duration: { values: [], count: 0 },
    dashboard_duration: { values: [], count: 0 },
    mail_inbox_duration: { values: [], count: 0 },
    attendance_duration: { values: [], count: 0 },
    timetable_duration: { values: [], count: 0 },
    assignments_duration: { values: [], count: 0 },
    exams_duration: { values: [], count: 0 },
    fees_duration: { values: [], count: 0 },
    notices_duration: { values: [], count: 0 },
    profile_duration: { values: [], count: 0 },
    faculty_dashboard_duration: { values: [], count: 0 },
    admin_dashboard_duration: { values: [], count: 0 },
    login_errors: { count: 0 },
    http_errors: { count: 0 },
    login_success: { count: 0 },
  };
  
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      
      if (entry.type === 'Point') {
        const metricName = entry.metric;
        const value = entry.data.value;
        
        if (metrics[metricName]) {
          if (Array.isArray(metrics[metricName].values)) {
            metrics[metricName].values.push(value);
          }
          metrics[metricName].count++;
        }
      }
    } catch (e) {
      // Skip invalid lines
    }
  }
  
  return metrics;
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

function generateReport(metrics) {
  const totalRequests = metrics.http_reqs.count;
  const failedRequests = metrics.http_req_failed.values.filter(v => v === 1).length;
  const errorRate = totalRequests > 0 ? (failedRequests / totalRequests * 100).toFixed(2) : 0;
  
  const durations = metrics.http_req_duration.values;
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  
  let report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                        COLLEGEOS LOAD TEST REPORT                            ║
║                          Generated: ${new Date().toISOString()}                         ║
╚══════════════════════════════════════════════════════════════════════════════╝

📊 OVERALL STATISTICS
═══════════════════════════════════════════════════════════════════════════════
Total Requests:      ${totalRequests.toLocaleString()}
Failed Requests:     ${failedRequests.toLocaleString()}
Error Rate:          ${errorRate}%
Avg Response Time:   ${formatDuration(avgDuration)}
Min Response Time:   ${formatDuration(Math.min(...durations) || 0)}
Max Response Time:   ${formatDuration(Math.max(...durations) || 0)}
p(50) Response Time: ${formatDuration(percentile(durations, 50))}
p(90) Response Time: ${formatDuration(percentile(durations, 90))}
p(95) Response Time: ${formatDuration(percentile(durations, 95))}
p(99) Response Time: ${formatDuration(percentile(durations, 99))}

🎯 SCENARIO-SPECIFIC METRICS
════════════════════════════════════════════════════════════════════════════════
`;
  
  const scenarioMetrics = [
    { name: 'Login', key: 'login_duration', errors: 'login_errors', success: 'login_success' },
    { name: 'Student Dashboard', key: 'dashboard_duration', errors: 'dashboard_errors' },
    { name: 'Mail Inbox', key: 'mail_inbox_duration', errors: 'mail_inbox_errors' },
    { name: 'Attendance', key: 'attendance_duration', errors: 'attendance_errors' },
    { name: 'Timetable', key: 'timetable_duration', errors: 'timetable_errors' },
    { name: 'Assignments', key: 'assignments_duration', errors: 'assignments_errors' },
    { name: 'Exams', key: 'exams_duration', errors: 'exams_errors' },
    { name: 'Fees', key: 'fees_duration', errors: 'fees_errors' },
    { name: 'Notices', key: 'notices_duration', errors: 'notices_errors' },
    { name: 'Profile', key: 'profile_duration', errors: 'profile_errors' },
    { name: 'Faculty Dashboard', key: 'faculty_dashboard_duration', errors: 'faculty_dashboard_errors' },
    { name: 'Admin Dashboard', key: 'admin_dashboard_duration', errors: 'admin_dashboard_errors' },
  ];
  
  for (const m of scenarioMetrics) {
    const values = metrics[m.key]?.values || [];
    const errors = metrics[m.errors]?.count || 0;
    const success = metrics[m.success]?.count || 0;
    
    if (values.length > 0) {
      report += `${m.name.padEnd(22)} | Count: ${values.length.toString().padStart(6)} | Avg: ${formatDuration(values.reduce((a,b)=>a+b,0)/values.length).padStart(10)} | p(95): ${formatDuration(percentile(values, 95)).padStart(10)} | Errors: ${errors}\n`;
    }
  }
  
  report += `
🔐 AUTHENTICATION METRICS
════════════════════════════════════════════════════════════════════════════════
Login Attempts:      ${metrics.login_duration.count}
Login Successes:     ${metrics.login_success.count}
Login Errors:        ${metrics.login_errors.count}
Login Success Rate:  ${metrics.login_duration.count > 0 ? ((metrics.login_success.count / metrics.login_duration.count) * 100).toFixed(2) : 0}%

📈 VIRTUAL USERS
════════════════════════════════════════════════════════════════════════════════
Max VUs:             ${Math.max(...(metrics.vus.values || [0]))}
Avg VUs:             ${metrics.vus.values.length > 0 ? (metrics.vus.values.reduce((a,b)=>a+b,0) / metrics.vus.values.length).toFixed(1) : 0}

🎯 THRESHOLD EVALUATION
════════════════════════════════════════════════════════════════════════════════
`;
  
  const thresholds = {
    'http_req_duration p(95)': { value: percentile(durations, 95), threshold: 2000 },
    'http_req_duration p(99)': { value: percentile(durations, 99), threshold: 5000 },
    'http_req_failed rate': { value: parseFloat(errorRate) / 100, threshold: 0.05 },
    'login_duration p(95)': { value: percentile(metrics.login_duration.values || [], 95), threshold: 1000 },
    'dashboard_duration p(95)': { value: percentile(metrics.dashboard_duration.values || [], 95), threshold: 1500 },
  };
  
  for (const [name, { value, threshold }] of Object.entries(thresholds)) {
    const status = value <= threshold ? '✅ PASS' : '❌ FAIL';
    report += `${name.padEnd(30)} | Value: ${formatDuration(value).padStart(10)} | Threshold: ${formatDuration(threshold).padStart(10)} | ${status}\n`;
  }
  
  report += `
════════════════════════════════════════════════════════════════════════════════
Report generated by CollegeOS Load Testing Infrastructure
`;
  
  return report;
}

function generateHTMLReport(metrics, outputPath) {
  const report = generateReport(metrics);
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CollegeOS Load Test Report</title>
    <style>
        body { font-family: 'Monospace', monospace; background: #1a1a2e; color: #eee; padding: 20px; }
        pre { background: #16213e; padding: 20px; border-radius: 8px; overflow-x: auto; border: 1px solid #0f3460; }
        .pass { color: #4ade80; }
        .fail { color: #f87171; }
        h1 { color: #B72026; border-bottom: 2px solid #B72026; padding-bottom: 10px; }
        .metric-card { background: #16213e; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #B72026; }
    </style>
</head>
<body>
    <h1>📊 CollegeOS Load Test Report</h1>
    <p>Generated: ${new Date().toISOString()}</p>
    <pre>${report.replace(/✅/g, '<span class="pass">✅</span>').replace(/❌/g, '<span class="fail">❌</span>')}</pre>
</body>
</html>`;
  
  fs.writeFileSync(outputPath, html);
  console.log(`HTML report generated: ${outputPath}`);
}

const args = process.argv.slice(2);
const inputFile = args[0] || 'reports/result.json';
const outputFile = args[1] || 'reports/report.txt';
const htmlOutput = args[2] || 'reports/report.html';

if (!fs.existsSync(inputFile)) {
  console.error(`Input file not found: ${inputFile}`);
  process.exit(1);
}

const metrics = parseK6Json(inputFile);
const report = generateReport(metrics);

fs.writeFileSync(outputFile, report);
console.log(report);

generateHTMLReport(metrics, htmlOutput);