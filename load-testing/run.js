#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROFILES = {
  smoke: { vus: 10, desc: 'Quick smoke test (10 VUs, 2 min)' },
  light: { vus: 100, desc: 'Light load test (100 VUs, 10 min)' },
  medium: { vus: 500, desc: 'Medium load test (500 VUs, 15 min)' },
  heavy: { vus: 1000, desc: 'Heavy load test (1000 VUs, 20 min)' },
  'stress-2500': { vus: 2500, desc: 'Stress test (2500 VUs, 25 min)' },
  'stress-5000': { vus: 5000, desc: 'Stress test (5000 VUs, 30 min)' },
  'stress-10000': { vus: 10000, desc: 'MAX stress test (10000 VUs, 40 min)' },
  soak: { vus: 1000, desc: 'Soak test (1000 VUs, 30 min)' },
  spike: { vus: 2000, desc: 'Spike test (burst to 2000 VUs, 10 min)' },
};

function printUsage() {
  console.log(`
CollegeOS Load Testing Runner
═══════════════════════════════

Usage: node run.js <profile> [options]

Profiles:
${Object.entries(PROFILES).map(([key, v]) => `  ${key.padEnd(15)} ${v.desc}`).join('\n')}

Options:
  --base-url <url>        Backend API base URL (default: http://localhost:4000)
  --frontend-url <url>    Frontend URL (default: http://localhost:3000)
  --output <dir>          Output directory for reports (default: ./reports)
  --no-report             Skip report generation
  --help                  Show this help

Examples:
  node run.js smoke
  node run.js light --base-url http://staging.collegeos.edu.np:4000
  node run.js stress-10000 --output /tmp/load-test-results
  node run.js custom --vus 500 --duration 10m
`);
}

function runTest(profileName, options) {
  const profile = PROFILES[profileName];
  
  if (!profile && profileName !== 'custom') {
    console.error(`Unknown profile: ${profileName}`);
    printUsage();
    process.exit(1);
  }
  
  const baseUrl = options['base-url'] || 'http://localhost:4000';
  const frontendUrl = options['frontend-url'] || 'http://localhost:3000';
  const outputDir = options.output || './reports';
  const skipReport = options['no-report'] === true;
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonOutput = path.join(outputDir, `result-${profileName}-${timestamp}.json`);
  const textOutput = path.join(outputDir, `report-${profileName}-${timestamp}.txt`);
  const htmlOutput = path.join(outputDir, `report-${profileName}-${timestamp}.html`);
  
  let k6Command = 'k6 run';
  
  if (profileName === 'custom') {
    const vus = options.vus || 100;
    const duration = options.duration || '10m';
    k6Command += ` --vus ${vus}`;
    k6Command += ` --duration ${duration}`;
  } else {
    k6Command += ` --env SCENARIO=${profileName}`;
  }
  
  k6Command += ` --env BASE_URL=${baseUrl}`;
  k6Command += ` --env FRONTEND_URL=${frontendUrl}`;
  k6Command += ` --out json=${jsonOutput}`;
  k6Command += ` main.js`;
  
  console.log(`\n🚀 Starting load test: ${profileName}`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Frontend URL: ${frontendUrl}`);
  console.log(`   Output: ${jsonOutput}`);
  console.log(`   Command: ${k6Command}\n`);
  
  try {
    execSync(k6Command, {
      cwd: __dirname,
      stdio: 'inherit',
      env: { ...process.env, K6_WEB_DASHBOARD: 'true', K6_WEB_DASHBOARD_EXPORT: htmlOutput.replace('.html', '-dashboard.html') }
    });
    
    console.log('\n✅ Load test completed successfully!');
    
    if (!skipReport && fs.existsSync(jsonOutput)) {
      console.log('\n📊 Generating report...');
      try {
        execSync(`node scripts/generate-report.js "${jsonOutput}" "${textOutput}" "${htmlOutput}"`, {
          cwd: __dirname,
          stdio: 'inherit'
        });
        console.log(`\n📄 Reports generated:`);
        console.log(`   Text: ${textOutput}`);
        console.log(`   HTML: ${htmlOutput}`);
      } catch (e) {
        console.warn('Report generation failed:', e.message);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Load test failed:', error.message);
    process.exit(1);
  }
}

const args = process.argv.slice(2);

if (args.includes('--help') || args.length === 0) {
  printUsage();
  process.exit(0);
}

const profileName = args[0];
const options = {};

for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  }
}

runTest(profileName, options);