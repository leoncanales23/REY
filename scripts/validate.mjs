import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

const required = [
  'rey/index.html',
  'rey/style.css',
  'rey/net.js',
  'rey/game.js',
  'rey/app.js',
  'rey/sw.js',
  'rey/manifest.webmanifest',
  'rey/icons/reinos-192.png',
  'rey/icons/reinos-512.png',
];

await Promise.all(required.map((path) => access(path, constants.R_OK)));
JSON.parse(await readFile('firebase.json', 'utf8'));
JSON.parse(await readFile('rey/manifest.webmanifest', 'utf8'));

const html = await readFile('rey/index.html', 'utf8');
const app = await readFile('rey/app.js', 'utf8');
const game = await readFile('rey/game.js', 'utf8');
const net = await readFile('rey/net.js', 'utf8');

for (const ref of ['style.css', 'net.js', 'game.js', 'app.js', 'manifest.webmanifest']) {
  if (!html.includes(ref)) throw new Error(`index.html no referencia ${ref}`);
}

if (html.includes('improvements.js')) {
  throw new Error('index.html referencia el prototipo desconectado improvements.js');
}

for (const marker of ['validateCommand', 'MAX_COMMAND_BYTES', 'RATE_PER_SECOND']) {
  if (!net.includes(marker)) throw new Error(`net.js no incluye ${marker}`);
}

const appDomIds = [...app.matchAll(/byId\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
for (const id of new Set(appDomIds)) {
  if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
    throw new Error(`app.js espera #${id}, pero index.html no lo declara`);
  }
}

const roomContractMarkers = [
  "params.get('room') || params.get('sala')",
  'Net.code',
  "url.searchParams.delete('sala')",
  "url.searchParams.set('room', code)",
];
for (const marker of roomContractMarkers) {
  if (!app.includes(marker)) throw new Error(`Contrato de salas incompleto: falta ${marker}`);
}

if (game.includes("'?sala=' + code") && !app.includes("params.get('sala')")) {
  throw new Error('game.js aún emite enlaces legacy ?sala=, pero app.js no los migra');
}

for (const id of ['joinInput', 'roomCode', 'netStatus2', 'copyInviteMenu', 'copyInviteHud', 'connectionBadge']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Falta el elemento crítico #${id}`);
}

console.log('Validación estática y contrato de salas de REINOS completados.');
