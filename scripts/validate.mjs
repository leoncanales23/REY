import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
const required = ['rey/index.html','rey/style.css','rey/net.js','rey/game.js','rey/app.js','rey/sw.js','rey/manifest.webmanifest','rey/icons/reinos-192.png','rey/icons/reinos-512.png'];
await Promise.all(required.map((path) => access(path, constants.R_OK)));
JSON.parse(await readFile('firebase.json', 'utf8'));
JSON.parse(await readFile('rey/manifest.webmanifest', 'utf8'));
const html = await readFile('rey/index.html', 'utf8');
for (const ref of ['style.css','net.js','game.js','app.js','manifest.webmanifest']) {
  if (!html.includes(ref)) throw new Error(`index.html no referencia ${ref}`);
}
if (html.includes('improvements.js')) throw new Error('index.html referencia el prototipo desconectado improvements.js');
const net = await readFile('rey/net.js', 'utf8');
for (const marker of ['validateCommand','MAX_COMMAND_BYTES','RATE_PER_SECOND']) {
  if (!net.includes(marker)) throw new Error(`net.js no incluye ${marker}`);
}
console.log('Validación estática de REINOS completada.');
