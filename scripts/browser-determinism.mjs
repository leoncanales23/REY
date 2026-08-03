import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(process.cwd());
const port = 4173;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
};

function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0] || '/').replace(/^\/+/, '');
  const candidate = normalize(join(root, clean || 'index.html'));
  return candidate.startsWith(root) ? candidate : null;
}

const server = createServer(async (request, response) => {
  try {
    let filePath = safePath(request.url || '/');
    if (!filePath) throw new Error('invalid path');
    const info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) filePath = join(filePath, 'index.html');
    const body = await readFile(filePath);
    response.writeHead(200, { 'content-type': mime[extname(filePath)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  }
});

await new Promise((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));

try {
  const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean);
  let browser = null;
  for (const candidate of candidates) {
    const lookup = spawnSync('bash', ['-lc', `command -v ${JSON.stringify(candidate)}`], { encoding: 'utf8' });
    if (lookup.status === 0 && lookup.stdout.trim()) {
      browser = lookup.stdout.trim();
      break;
    }
  }
  if (!browser) throw new Error('No se encontró Chrome o Chromium en el runner');

  const target = `http://127.0.0.1:${port}/rey/?determinism-test=1`;
  const run = spawnSync(browser, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--mute-audio',
    '--virtual-time-budget=30000',
    '--dump-dom',
    target,
  ], { encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024 });

  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`Chrome terminó con código ${run.status}: ${run.stderr}`);
  if (!run.stdout.includes('data-determinism="pass"')) {
    const probe = run.stdout.match(/<pre id="determinismProbe"[^>]*>([\s\S]*?)<\/pre>/)?.[1] || 'sin resultado';
    throw new Error(`La prueba de navegador no verificó determinismo: ${probe}`);
  }
  const probe = run.stdout.match(/<pre id="determinismProbe"[^>]*>([\s\S]*?)<\/pre>/)?.[1] || 'ok';
  console.log(`Prueba E2E de navegador completada: ${probe}`);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
