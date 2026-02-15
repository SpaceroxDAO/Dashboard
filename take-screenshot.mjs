import { chromium } from 'playwright';
import { homedir } from 'os';
import { join } from 'path';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://192.168.64.3:5173/');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(homedir(), 'clawd', 'agent-dashboard', 'screenshot.png'), fullPage: true });
  await browser.close();
  console.log('Screenshot saved');
})();
