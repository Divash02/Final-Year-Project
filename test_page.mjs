import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];

  page.on('console', msg => {
    console.log('CONSOLE [' + msg.type() + ']: ' + msg.text());
  });
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));
  page.on('requestfailed', req => errors.push('REQ FAILED: ' + req.url() + ' ' + req.failure().errorText));

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);

    const rootHtml = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? root.innerHTML.substring(0, 2000) : 'ROOT NOT FOUND';
    });

    console.log('=== ROOT HTML ===');
    console.log(rootHtml);
    console.log('=== ERRORS ===');
    console.log(errors.length ? errors.join('\n') : 'No errors');

    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('=== PAGE INFO ===');
    console.log('Body text:', bodyText);
  } catch (e) {
    console.log('NAVIGATION ERROR:', e.message);
  } finally {
    await browser.close();
  }
})();