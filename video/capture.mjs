import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const FRAMES_DIR = path.join(ROOT, 'frames');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const server = await startServer();
  const port = server.address().port;

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (msg) => { if (msg.type() === 'error') console.error('[page error]', msg.text()); });
  page.on('pageerror', (err) => console.error('[pageerror]', err));

  await page.goto(`http://127.0.0.1:${port}/index.html?capture=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.sceneReady === true, { timeout: 15000 });

  const FPS = await page.evaluate(() => window.FPS);
  const DURATION = await page.evaluate(() => window.TOTAL_DURATION);
  const totalFrames = Math.round(DURATION * FPS);
  console.log(`Rendering ${totalFrames} frames at ${FPS}fps (${DURATION.toFixed(2)}s)`);

  const appHandle = await page.$('#app');

  const t0 = Date.now();
  for (let i = 0; i < totalFrames; i++) {
    const t = i / FPS;
    await page.evaluate((t) => { window.setSceneTime(t); }, t);
    const framePath = path.join(FRAMES_DIR, `frame_${String(i).padStart(5, '0')}.png`);
    await appHandle.screenshot({ path: framePath });
    if (i % 60 === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      console.log(`frame ${i}/${totalFrames} (${elapsed.toFixed(1)}s elapsed)`);
    }
  }

  await browser.close();
  server.close();
  console.log('Done capturing frames.');
}

main().catch((err) => { console.error(err); process.exit(1); });
