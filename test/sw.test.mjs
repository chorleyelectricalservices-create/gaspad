import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
const root = new URL('../', import.meta.url);
test('sw.js is intact, versioned to match the app, and caches every JS file', () => {
  const sw = fs.readFileSync(new URL('sw.js', root), 'utf8'); const app = fs.readFileSync(new URL('js/app.js', root), 'utf8');
  assert.ok(sw.length > 500, 'sw.js looks empty');
  assert.match(sw, /skipWaiting/); assert.match(sw, /clients\.claim/); assert.match(sw, /addEventListener\('fetch'/);
  const v = app.match(/APP_VERSION = '([\d.]+)'/)[1]; assert.match(sw, new RegExp(`VERSION = 'gaspad-v${v.replace(/\./g, '\\.')}'`));
  for (const f of fs.readdirSync(new URL('js/', root))) assert.ok(sw.includes(`'js/${f}'`), `sw.js missing js/${f}`);
});
