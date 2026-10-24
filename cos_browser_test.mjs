import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text());
  });
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

  try {
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);

    const rootHtml = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? root.innerHTML.substring(0, 2000) : 'ROOT NOT FOUND';
    });

    console.log('=== ROOT HTML ===');
    console.log(rootHtml);
    console.log('=== ERRORS ===');
    console.log(errors.length ? errors.join('\n') : 'No errors');

    const hasLoginHeading = await page.evaluate(() => !!document.querySelector('h1'));
    const hasForm = await page.evaluate(() => !!document.querySelector('form'));
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));

    console.log('=== PAGE INFO ===');
    console.log('Has h1:', hasLoginHeading);
    console.log('Has form:', hasForm);
    console.log('Body text:', bodyText);
  } catch (e) {
    console.log('NAVIGATION ERROR:', e.message);
  } finally {
    await browser.close();
  }
})();