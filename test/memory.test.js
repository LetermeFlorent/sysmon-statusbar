const test = require('node:test');
const assert = require('node:assert');
const p = require('../src/memory/parse');
const { MemoryReader } = require('../src/memory/reader');
const w = require('../src/probes/windows');

const MEMINFO = [
  'MemTotal:       16303412 kB',
  'MemFree:          812344 kB',
  'MemAvailable:    9876544 kB',
  'SwapTotal:       2097148 kB',
  'SwapFree:        1048574 kB'
].join('\n');

test('parseMeminfo lit MemAvailable et la swap en octets', () => {
  const r = p.parseMeminfo(MEMINFO);
  assert.strictEqual(r.availableBytes, 9876544 * 1024);
  assert.strictEqual(r.swapTotalBytes, 2097148 * 1024);
  assert.strictEqual(r.swapFreeBytes, 1048574 * 1024);
});

test('parseMeminfo rend null pour un champ absent', () => {
  const r = p.parseMeminfo('MemTotal: 100 kB');
  assert.strictEqual(r.availableBytes, null);
  assert.strictEqual(r.swapTotalBytes, null);
});

test('parseSwapusage comprend la sortie de sysctl sur macOS', () => {
  const r = p.parseSwapusage('total = 2048.00M  used = 1300.75M  free = 747.25M  (encrypted)');
  assert.strictEqual(r.totalBytes, 2048 * 1048576);
  assert.strictEqual(r.usedBytes, 1300.75 * 1048576);
});

test('parseSwapusage accepte les gigaoctets et une swap vide', () => {
  assert.strictEqual(p.parseSwapusage('total = 4.00G  used = 1.00G  free = 3.00G').totalBytes, 4 * 1073741824);
  assert.deepStrictEqual(p.parseSwapusage('total = 0.00M  used = 0.00M  free = 0.00M'), { totalBytes: 0, usedBytes: 0 });
  assert.strictEqual(p.parseSwapusage('rien'), null);
});

test('parsePageFileMb convertit la taille allouee de Windows', () => {
  assert.strictEqual(p.parsePageFileMb('15872\r\n'), 15872 * 1048576);
  assert.strictEqual(p.parsePageFileMb(''), null);
  assert.strictEqual(p.parsePageFileMb('abc'), null);
});

test('le compteur de fichier d echange est reconnu en anglais et en francais', () => {
  assert.strictEqual(w.columnKind('\\\\PC\\Paging File(_Total)\\% Usage'), 'swap');
  assert.strictEqual(w.columnKind('\\\\PC\\Fichier d\'change(_Total)\\Pourcentage d\'utilisation'), 'swap');
  assert.ok(w.COUNTERS.some(c => /Fichier d’échange/.test(c)));
});

test('parseValues remonte le pourcentage de swap', () => {
  const kinds = w.parseHeader('"(PDH-CSV 4.0)","\\\\PC\\PhysicalDisk(_Total)\\% Disk Time","\\\\PC\\Paging File(_Total)\\% Usage"');
  const v = w.parseValues('"09/25/2026 10:00:00.000","3.0","59.47"', kinds);
  assert.strictEqual(v.swap, 59.47);
  assert.strictEqual(v.disk, 3);
});

test('une ligne avec la seule swap reste une mesure valide', () => {
  const kinds = w.parseHeader('"(PDH-CSV 4.0)","\\\\PC\\Paging File(_Total)\\% Usage"');
  const v = w.parseValues('"09/25/2026 10:00:00.000","12.5"', kinds);
  assert.strictEqual(v.swap, 12.5);
  assert.strictEqual(v.gpu, null);
});

test('la swap Windows combine le pourcentage de la sonde et la taille allouee', () => {
  const r = new MemoryReader('win32');
  r.pageFileBytes = 1000;
  const u = r.read({ swap: 25 }).swap;
  assert.strictEqual(u.usedBytes, 250);
  assert.strictEqual(u.freeBytes, 750);
  assert.strictEqual(r.read({ swap: null }).swap, null);
});

test('un Windows sans fichier d echange rend une swap vide', () => {
  const r = new MemoryReader('win32');
  r.pageFileBytes = 0;
  assert.strictEqual(r.read({ swap: 10 }).swap.totalBytes, 0);
});

test('ramSnapshot rend un pourcentage coherent avec les octets', () => {
  const r = require('../src/metrics').ramSnapshot();
  assert.ok(r.totalBytes > 0);
  assert.ok(r.usedBytes > 0 && r.usedBytes <= r.totalBytes);
  const expected = r.usedBytes / r.totalBytes * 100;
  assert.ok(Math.abs(r.pct - expected) < 0.001);
});

test('ramSnapshot prend la memoire disponible fournie par Linux', () => {
  const m = require('../src/metrics');
  const r = m.ramSnapshot(1024);
  assert.strictEqual(r.freeBytes, 1024);
  assert.strictEqual(r.usedBytes, r.totalBytes - 1024);
});

test('usage borne les octets utilises au total', () => {
  const m = require('../src/metrics');
  assert.deepStrictEqual(m.usage(150, 100), { usedBytes: 100, totalBytes: 100, freeBytes: 0, pct: 100 });
  assert.strictEqual(m.usage(0, 0).pct, 0);
});
