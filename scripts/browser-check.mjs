import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const external = process.env.TEST_BASE_URL;
const baseURL = external || 'http://127.0.0.1:4174';
const server = external ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: 'pipe' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(baseURL)).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Preview server must be available; run npm run build first.');
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1040 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#app')).toHaveAttribute('data-actor', 'biped');
  await expect(page.locator('#app')).toHaveAttribute('data-memory', 'false');
  assert.ok(Number.parseFloat(await page.locator('#before-tilt').innerText()) > 15);
  await mkdir('artifacts', { recursive: true });
  if (process.env.UPDATE_SCREENSHOTS) await mkdir('docs', { recursive: true });
  const screenshot = name => page.screenshot({ path: `${process.env.UPDATE_SCREENSHOTS ? 'docs' : 'artifacts'}/${name}.png`, fullPage: true });
  await screenshot('hero');

  await page.locator('#prompt').fill('Un robot bleu porte une boîte vers une table proche et salue.');
  await page.locator('#generate').click();
  await expect(page.locator('#scene-svg')).toHaveAttribute('data-phase', 'approach');
  const seek = async value => page.locator('#seek').evaluate((element, v) => { element.value = String(v); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await seek(450);
  await expect(page.locator('#scene-svg')).toHaveAttribute('data-phase', 'carry');
  assert.ok(Math.abs(Number(await page.locator('#scene-svg').getAttribute('data-angle'))) > .01);
  await page.locator('#teach').click();
  const handle = page.locator('[data-drag-handle]');
  const points = await handle.evaluate(element => {
    const group = element.parentElement;
    const center = new DOMPoint(0, 0).matrixTransform(group.getScreenCTM());
    const p = new DOMPoint(Number(element.getAttribute('cx')), 0).matrixTransform(element.getScreenCTM());
    const scale = document.querySelector('#scene-svg').getScreenCTM().a;
    return { x:p.x, y:p.y, tx:center.x + Number(element.getAttribute('cx')) * scale, ty:center.y };
  });
  await page.mouse.move(points.x, points.y); await page.mouse.down();
  await page.mouse.move(points.tx, points.ty, { steps: 8 }); await page.mouse.up();
  assert.ok(Math.abs(Number(await page.locator('#scene-svg').getAttribute('data-angle'))) < .02, 'The gesture must visibly rotate the object.');
  await page.locator('#remember').click();
  await expect(page.locator('#app')).toHaveAttribute('data-memory', 'true');
  await expect(page.locator('#after-tilt')).toHaveText('0.0°');
  const remembered = await page.evaluate(() => localStorage.getItem('morphe.motion-memory.v1'));
  assert.equal(JSON.parse(remembered).source, 'gesture');

  await page.locator('#step-transfer').click();
  await seek(490);
  await expect(page.locator('#app')).toHaveAttribute('data-actor', 'quadruped');
  await expect(page.locator('#app')).toHaveAttribute('data-transferred', 'true');
  await expect(page.locator('#scene-svg')).toHaveAttribute('data-rule-applied', 'true');
  assert.equal(Number(await page.locator('#scene-svg').getAttribute('data-angle')), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('morphe.motion-memory.v1')), remembered, 'Transfer must reuse the exact original rule.');
  await expect(page.locator('#toast')).toBeHidden();
  await screenshot('transfer');
  await page.locator('#memory-toggle').click();
  await expect(page.locator('#scene-svg')).toHaveAttribute('data-rule-applied', 'false');
  assert.ok(Math.abs(Number(await page.locator('#scene-svg').getAttribute('data-angle'))) > .01);
  await page.locator('#memory-toggle').click();

  const exportEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const exported = await exportEvent;
  const session = JSON.parse(await readFile(await exported.path(), 'utf8'));
  assert.equal(session.scene.actor, 'quadruped'); assert.equal(session.rule.targetAngle, 0);
  const svgEvent = page.waitForEvent('download'); await page.locator('#export-svg').click();
  const svg = await readFile(await (await svgEvent).path(), 'utf8');
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.ok(!svg.includes('data-drag-handle'));
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-memory', 'true');
  await page.locator('#import-file').setInputFiles({ name: 'session.morphe.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(session)) });
  await expect(page.locator('#app')).toHaveAttribute('data-actor', 'quadruped');
  await expect(page.locator('#app')).toHaveAttribute('data-transferred', 'true');
  await page.locator('#prompt').fill('A robot flies above the moon'); await page.locator('#generate').click();
  await expect(page.locator('#feedback')).toHaveClass(/error/);
  await expect(page.locator('#app')).toHaveAttribute('data-actor', 'quadruped');
  await page.locator('#import-file').setInputFiles({ name:'bad.json', mimeType:'application/json', buffer:Buffer.from('{"format":"morphe-motion","version":1}') });
  await expect(page.locator('#feedback')).toContainText('Invalid scene plan');
  await page.locator('#forget').click(); await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-memory', 'false');
  await page.locator('#prompt').fill('Keep the object level'); await page.locator('#generate').click();
  await expect(page.locator('#app')).toHaveAttribute('data-memory', 'true');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('morphe.motion-memory.v1')).source), 'text');
  await page.locator('#teach').click();await page.locator('#level').click();await page.locator('#remember').click();
  await expect(page.locator('#after-tilt')).toHaveText('0.0°');
  await page.setViewportSize({ width:390, height:844 });
  await page.screenshot({ path:'artifacts/mobile.png', fullPage:true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile must not overflow horizontally.');
  assert.deepEqual(errors, [], 'No browser runtime errors.');
  console.log('Browser checks passed: prompt, actual drag, memory transfer, A/B, persistence, exports/import, refusal, accessible teaching, mobile layout.');
} finally {
  await browser?.close(); server?.kill();
}
