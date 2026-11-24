/*
 * tutorial-screencast: record a Playwright session with a visible cursor, step captions and
 * title cards, then convert it to an H.264 MP4 with ffmpeg.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadChromium, PROFILE, tool } from './pw.mjs';

export const W = 1440;
export const H = 900;

// Injected into the top frame on every navigation: fake cursor, captions, title cards.
const OVERLAY = () => {
  if (window.top !== window) return;
  const install = () => {
    if (document.getElementById('tt-root')) return;
    const root = document.createElement('div');
    root.id = 'tt-root';
    root.innerHTML = `
      <style>
        #tt-root, #tt-root * { box-sizing: border-box; }
        #tt-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647;
          pointer-events: none; transition: transform .7s cubic-bezier(.4,0,.2,1); transform: translate(720px,450px); }
        #tt-cursor svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
        #tt-ring { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
          border: 3px solid #3b63fb; z-index: 2147483646; pointer-events: none; opacity: 0; }
        #tt-ring.on { animation: tt-ping .55s ease-out; }
        @keyframes tt-ping { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(1.4); } }
        #tt-caption { position: fixed; left: 50%; bottom: 104px; transform: translateX(-50%) translateY(20px);
          max-width: 1180px; white-space: nowrap; padding: 14px 26px; border-radius: 14px; background: rgba(20,20,24,.92);
          color: #fff; font: 500 22px/1.35 -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center;
          z-index: 2147483645; pointer-events: none; opacity: 0; transition: opacity .35s, transform .35s; }
        #tt-caption.on { opacity: 1; transform: translateX(-50%) translateY(0); }
        #tt-caption b { color: #9db4ff; font-weight: 700; }
        #tt-caption .n { display: inline-block; min-width: 30px; height: 30px; margin-right: 12px; border-radius: 50%;
          background: #3b63fb; color: #fff; font: 700 17px/30px -apple-system, sans-serif; vertical-align: 2px; }
        #tt-card { position: fixed; inset: 0; z-index: 2147483644; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 18px; background: linear-gradient(135deg,#101828,#1d2b64);
          color: #fff; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center;
          opacity: 0; pointer-events: none; transition: opacity .5s; }
        #tt-card.on { opacity: 1; }
        #tt-card h1 { margin: 0; font-size: 54px; font-weight: 800; letter-spacing: -.5px; max-width: 1100px; }
        #tt-card p { margin: 0; font-size: 26px; color: #c7d2fe; max-width: 1000px; }
        #tt-card ol { margin: 10px 0 0; padding: 0; list-style: none; font-size: 22px; color: #e0e7ff; line-height: 1.7; }
      </style>
      <div id="tt-card"></div>
      <div id="tt-caption"></div>
      <div id="tt-ring"></div>
      <div id="tt-cursor"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.4-7.6L20.5 11z"
        fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>`;
    document.documentElement.append(root);
    // A popover, so it can sit in the top layer above modal dialogs (see raise()).
    root.setAttribute('popover', 'manual');
    Object.assign(root.style, {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh', margin: '0', padding: '0',
      border: '0', background: 'transparent', overflow: 'visible', pointerEvents: 'none',
    });
    try { root.showPopover(); } catch { root.removeAttribute('popover'); }
  };
  // Modal dialogs (e.g. a full-size plugin) render in the browser's top layer, above any z-index.
  // Re-opening the overlay popover puts it back on top of the top layer.
  const raise = () => {
    const root = document.getElementById('tt-root');
    if (!root || !root.showPopover) return; // modals in shadow DOM can't be detected, so always re-raise
    try {
      if (root.matches(':popover-open')) root.hidePopover();
      root.showPopover();
    } catch { /* not supported: captions stay below the dialog */ }
  };
  window.__tt = {
    move(x, y, ms) {
      install();
      raise();
      const c = document.getElementById('tt-cursor');
      c.style.transitionDuration = `${ms}ms`;
      c.style.transform = `translate(${x}px,${y}px)`;
    },
    ping(x, y) {
      install();
      raise();
      const r = document.getElementById('tt-ring');
      r.style.left = `${x}px`; r.style.top = `${y}px`;
      r.classList.remove('on'); r.getBoundingClientRect(); r.classList.add('on');
    },
    caption(html) {
      install();
      raise();
      const c = document.getElementById('tt-caption');
      if (!html) { c.classList.remove('on'); return; }
      c.innerHTML = html; c.classList.add('on');
    },
    card(html) {
      install();
      raise();
      const c = document.getElementById('tt-card');
      document.getElementById('tt-cursor').style.opacity = html ? '0' : '1';
      if (!html) { c.classList.remove('on'); return; }
      c.innerHTML = html; c.classList.add('on');
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
};

function makeHelpers(page) {
  let pos = { x: W / 2, y: H / 2 };
  let captionHtml = ''; // re-shown after a navigation replaces the document
  const wait = (ms) => page.waitForTimeout(ms);
  const tt = (fn, ...args) => page.evaluate(([f, a]) => window.__tt && window.__tt[f](...a), [fn, args])
    .catch(() => {});

  async function center(locator) {
    await locator.waitFor({ state: 'visible', timeout: 20000 });
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), box: b };
  }

  async function moveTo(x, y, ms = 550) {
    const dur = Math.round(Math.max(250, Math.min(ms, Math.hypot(x - pos.x, y - pos.y) * 1.4)));
    await tt('move', x, y, dur);
    await page.mouse.move(x, y, { steps: 12 });
    pos = { x, y };
    await wait(dur + 80);
  }

  async function clickAt(x, y, { pause = 300, clickCount = 1 } = {}) {
    await moveTo(x, y);
    await wait(pause);
    await tt('ping', x, y);
    await page.mouse.click(x, y, { clickCount });
    await wait(400);
  }

  return {
    page,
    wait,
    center,
    moveTo,
    clickAt,
    async caption(html, hold = 0) { captionHtml = html; await tt('caption', html); if (hold) await wait(hold); },
    async card(html, hold = 0) { await tt('card', html); if (hold) await wait(hold); },
    async hover(locator) { const c = await center(locator); await moveTo(c.x, c.y); return c; },
    // Move the visible cursor there, then let Playwright click (it waits until the control is
    // enabled and not covered, which a raw mouse click would not).
    async click(locator, { pause = 350 } = {}) {
      const c = await center(locator);
      await moveTo(c.x, c.y);
      await wait(pause);
      await tt('ping', c.x, c.y);
      await locator.click({ timeout: 20000 });
      await wait(400);
      return c;
    },
    async type(text, delay = 90) { await page.keyboard.type(text, { delay }); },
    async press(key) { await page.keyboard.press(key); },
    // Put the cursor and the current caption back after a navigation replaced the document.
    async restoreCursor() { await tt('move', pos.x, pos.y, 0); if (captionHtml) await tt('caption', captionHtml); },
  };
}

// The AEM Sidekick extension, built from github.com/adobe/aem-sidekick (`npm run build`).
export const SIDEKICK = process.env.TUTORIAL_SIDEKICK
  || path.join(os.homedir(), 'repos/github.com/adobe/aem-sidekick/dist/chrome');

export async function startRecording({
  rawDir, rawRoot, headless = true, sidekick = false, consentBanner = false,
}) {
  const rel = path.relative(rawRoot, rawDir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`refusing to clear ${rawDir}: not inside ${rawRoot}`);
  rmSync(rawDir, { recursive: true, force: true });
  mkdirSync(rawDir, { recursive: true });
  const chromium = await loadChromium();
  if (sidekick && !existsSync(path.join(SIDEKICK, 'manifest.json'))) {
    throw new Error(`no Sidekick build at ${SIDEKICK}: build github.com/adobe/aem-sidekick or set TUTORIAL_SIDEKICK`);
  }
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    // Extensions need a visible browser.
    headless: sidekick ? false : headless,
    args: [
      ...(sidekick ? [`--disable-extensions-except=${SIDEKICK}`, `--load-extension=${SIDEKICK}`] : []),
      // the live site's cookie banner hides itself from automated browsers (navigator.webdriver)
      ...(consentBanner ? ['--disable-blink-features=AutomationControlled'] : []),
    ],
    viewport: { width: W, height: H },
    recordVideo: { dir: rawDir, size: { width: W, height: H } },
  });
  if (sidekick) {
    // Show the Sidekick on every page, as a click on its toolbar icon would.
    let [worker] = ctx.serviceWorkers();
    if (!worker) worker = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    await worker.evaluate(() => globalThis.chrome.storage.local.set({ display: true }));
  }
  await ctx.addInitScript(OVERLAY);
  const page = ctx.pages()[0] || await ctx.newPage();
  return { ctx, page, t: makeHelpers(page), startedAt: Date.now() };
}

// Close the browser and convert the WebM to MP4, cutting the blank start before the title card.
// `cuts` are [from, to] seconds since recording started (e.g. waits for the CDN); they are removed.
// `fast` are [from, to, seconds]: the span plays back sped up to last about `seconds` (an AI
// assistant thinking for a minute shows as a few seconds of fast-forward).
export async function finishRecording({ ctx, page }, outFile, { trimStart = 0, cuts = [], fast = [] } = {}) {
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  mkdirSync(path.dirname(outFile), { recursive: true });
  // Keep half a second on each side of a cut so the change of screen still reads.
  const spans = cuts.map(([a, b]) => [a - trimStart + 0.5, b - trimStart - 0.5]).filter(([a, b]) => b - a > 1 && b > 0);
  const keep = [];
  if (spans.length) keep.push(`not(${spans.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+')})`);
  for (const [a0, b0, secs] of fast) {
    const [a, b] = [a0 - trimStart, b0 - trimStart];
    const k = Math.round((b - a) / Math.max(1, secs));
    if (b > 0 && k >= 2) keep.push(`if(between(t,${a.toFixed(2)},${b.toFixed(2)}),not(mod(n,${k})),1)`);
  }
  const vf = keep.length ? ['-vf', `fps=30,select='${keep.join('*')}',setpts=N/(30*TB)`] : [];
  execFileSync(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-ss', String(trimStart), '-i', src, ...vf,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-r', '30', outFile]);
  return outFile;
}

// 15 frames evenly spread over the video plus its last frame, tiled 4×4, for a quick check of the whole video.
export function contactSheet(videoFile, sheetFile) {
  const total = duration(videoFile);
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'tt-sheet-'));
  try {
    for (let i = 0; i < 15; i += 1) {
      const at = total * (i / 15);
      execFileSync(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', videoFile,
        '-frames:v', '1', '-vf', 'scale=480:-1', path.join(tmp, `f${String(i).padStart(2, '0')}.png`)]);
    }
    // Tile 16 is the real last frame: decode the final second and keep overwriting until EOF.
    execFileSync(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-sseof', '-1', '-i', videoFile,
      '-vf', 'scale=480:-1', '-update', '1', path.join(tmp, 'f15.png')]);
    execFileSync(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(tmp, 'f%02d.png'),
      '-vf', 'tile=4x4', '-frames:v', '1', sheetFile]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return sheetFile;
}

export function duration(videoFile) {
  return Number(execFileSync(tool('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', videoFile]).toString().trim());
}
