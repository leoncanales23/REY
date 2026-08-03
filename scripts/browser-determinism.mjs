import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(process.cwd());
const port = 4173;
const MAX_OUTPUT = 8 * 1024 * 1024;
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

async function deterministicHarness() {
  const index = await readFile(join(root, 'rey/index.html'), 'utf8');
  return index
    .replace(/\s*<script src="https:\/\/unpkg\.com\/peerjs[^>]*><\/script>/, '')
    .replace(/\s*<script src="app\.js"><\/script>/, '')
    .replace(/\s*<script src="chronicle\.js"><\/script>/, '')
    .replace(/\s*<script src="campaign\.js"><\/script>/, '')
    .replace(/\s*<script src="scenario\.js"><\/script>/, '')
    .replace(/\s*<script src="replay\.js"><\/script>/, '');
}

function runBrowser(browser, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(browser, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectRun(error);
      else resolveRun(result);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Chrome excedió 30 segundos durante la prueba determinista'));
    }, 30000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_OUTPUT) {
        child.kill('SIGKILL');
        finish(new Error('Chrome produjo más de 8 MB de salida DOM'));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(-MAX_OUTPUT);
    });
    child.on('error', (error) => finish(error));
    child.on('close', (code, signal) => {
      if (code !== 0) {
        finish(new Error(`Chrome terminó con código ${code ?? 'nulo'} (${signal || 'sin señal'}): ${stderr}`));
        return;
      }
      finish(null, { stdout, stderr });
    });
  });
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${port}`);
    if (requestUrl.pathname === '/rey/determinism-harness.html') {
      response.writeHead(200, { 'content-type': mime['.html'] });
      response.end(await deterministicHarness());
      return;
    }

    let filePath = safePath(requestUrl.pathname);
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

  const target = `http://127.0.0.1:${port}/rey/determinism-harness.html?determinism-test=1`;
  const run = await runBrowser(browser, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--mute-audio',
    '--virtual-time-budget=15000',
    '--dump-dom',
    target,
  ]);

  if (!run.stdout.includes('data-determinism="pass"')) {
    const probe = run.stdout.match(/<pre id="determinismProbe"[^>]*>([\s\S]*?)<\/pre>/)?.[1] || 'sin resultado';
    throw new Error(`La prueba de navegador no verificó determinismo: ${probe}`);
  }
  const probe = run.stdout.match(/<pre id="determinismProbe"[^>]*>([\s\S]*?)<\/pre>/)?.[1] || 'ok';
  console.log(`Prueba E2E de navegador completada: ${probe}`);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
