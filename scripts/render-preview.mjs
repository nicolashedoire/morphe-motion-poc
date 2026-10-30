// Rebuild the README animation from the same engine and SVG renderer as the app.
// Requires Node 24+, npm ci, ffmpeg, and Chrome or Playwright Chromium.
// Run from the repository root: node scripts/render-preview.mjs
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { DEFAULT_SCENE } from '../src/domain.ts';
import { makeRule } from '../src/memory.ts';
import { sampleMotion } from '../src/motion.ts';
import { renderStage } from '../src/renderer.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const framesDirectory = join(root, 'artifacts', 'preview-frames');
const output = join(root, 'docs', 'motion-memory.gif');
const ffmpeg = process.env.FFMPEG_PATH || (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const originalPlan = { ...DEFAULT_SCENE };
const transferPlan = { ...DEFAULT_SCENE, actor: 'quadruped', color: 'violet', prop: 'tray', destination: 'shelf' };
// This is one explicit symbolic correction, not model training or a generated video.
const rule = { ...makeRule({ actor: 'biped', source: 'gesture' }), createdAt: '2026-10-30T00:00:00.000Z' };
const frameCount = 60;
const fps = 10;

function scene(frame, plan, suffix) {
  // Both actual SVG scenes share a page; namespace their definition IDs.
  return renderStage(frame, plan)
    .replaceAll('scene-svg', `scene-svg-${suffix}`)
    .replaceAll('window-light', `window-light-${suffix}`)
    .replaceAll('dots', `dots-${suffix}`);
}

function pair(progress, prefix = 'live') {
  const before = sampleMotion(originalPlan, progress, null);
  const after = sampleMotion(transferPlan, progress, rule);
  const angle = frame => `${Math.abs(frame.prop.angle * 180 / Math.PI).toFixed(1)}° tilt`;
  return `<div class="pair">
    <section class="panel original">
      <div class="label"><span><i></i>ORIGINAL <b>•</b> NO MEMORY</span><strong>${angle(before)}</strong></div>
      <div class="stage">${scene(before, originalPlan, `${prefix}-before`)}</div>
      <div class="track"><span style="width:${progress * 100}%"></span></div>
    </section>
    <section class="panel transfer">
      <div class="label"><span><i></i>TRANSFER <b>•</b> SAME RULE</span><strong>${angle(after)}</strong></div>
      <div class="stage">${scene(after, transferPlan, `${prefix}-after`)}</div>
      <div class="track"><span style="width:${progress * 100}%"></span></div>
    </section>
  </div>`;
}

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:1000px;height:430px;overflow:hidden}
  body{background:#f8f7ef;color:#253f36;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased}
  header{position:absolute;inset:0 0 auto;height:94px;padding:19px 24px}
  .eyebrow{font-size:10px;letter-spacing:2.1px;color:#758273;font-weight:700}
  h1{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:32px;letter-spacing:-.9px;line-height:1.1;margin:10px 0 0}
  .badge{position:absolute;top:42px;right:24px;border:1px solid #dce2d2;border-radius:20px;padding:10px 14px;font-size:10px;letter-spacing:1.5px;color:#73836f;background:#f1f3e9}
  #live,#reset{position:absolute;inset:99px 24px auto;height:290px}
  #reset{pointer-events:none;opacity:0}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .panel{min-width:0;position:relative}
  .label{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:9px;letter-spacing:1.15px;font-weight:700;color:#517366}
  .label i{display:inline-block;width:6px;height:6px;background:#207e76;border-radius:50%;margin-right:7px}
  .label b{padding:0 4px;font-weight:400;color:#a4b09d}
  .label strong{font-size:11px;letter-spacing:0;font-weight:400;font-variant-numeric:tabular-nums;color:#697969}
  .transfer .label{color:#76658f}.transfer .label i{background:#8771af}
  .stage{border:1px solid #d9dfd2;border-radius:14px;overflow:hidden;background:#f5f3eb}
  .stage svg{width:100%;display:block}
  .track{position:absolute;left:14px;right:14px;bottom:0;height:2px;background:#dfe3d7;overflow:hidden}
  .track span{display:block;height:100%;background:#6aa48e}.transfer .track span{background:#a390bd}
  footer{position:absolute;left:24px;right:24px;bottom:15px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#788370}
  .lesson{color:#4e6656}.lesson span{color:#8b9481;margin-left:7px}
  .note{font-size:10px;color:#919887}
</style><body>
  <header><div class="eyebrow">MORPHE / MOTION MEMORY</div><h1>One correction. A different body.</h1><div class="badge">1 RULE &nbsp;→&nbsp; 2 BODIES</div></header>
  <main id="live"></main><div id="reset"></div>
  <footer><div class="lesson">“Keep the carried object level.”<span>Taught once on Pip.</span></div><div class="note">Deterministic prototype · StykAnimate IK</div></footer>
</body></html>`;

await mkdir(framesDirectory, { recursive: true });
await mkdir(join(root, 'docs'), { recursive: true });
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 430 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const reset = pair(0, 'reset');
  // 54 forward samples, 2 final holds, 4 dissolve frames. The dissolve is only
  // an editorial loop transition: all geometry comes directly from sampleMotion.
  for (let i = 0; i < frameCount; i++) {
    const progress = Math.min(i / 53, 1);
    const opacity = i >= 56 ? (i - 55) / 5 : 0;
    await page.evaluate(({ markup, reset, opacity }) => {
      document.querySelector('#live').innerHTML = markup;
      const overlay = document.querySelector('#reset');
      overlay.innerHTML = reset;
      overlay.style.opacity = String(opacity);
    }, { markup: pair(progress), reset, opacity });
    await page.screenshot({ path: join(framesDirectory, `${String(i).padStart(3, '0')}.png`) });
  }
} finally {
  await browser.close();
}

const encoded = spawnSync(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps),
  '-start_number', '0', '-i', join(framesDirectory, '%03d.png'),
  '-filter_complex', '[0:v]split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
  '-frames:v', String(frameCount), '-loop', '0', output,
], { encoding: 'utf8' });
if (encoded.error) throw encoded.error;
if (encoded.status !== 0) throw new Error(encoded.stderr || 'ffmpeg failed.');
const { size } = await stat(output);
console.log(`Created ${output}: 1000×430, ${frameCount} frames, ${frameCount / fps}s, ${(size / 1024 / 1024).toFixed(2)} MiB.`);
if (size > 3 * 1024 * 1024) throw new Error('Preview exceeds the 3 MiB budget.');
