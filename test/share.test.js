const test = require('node:test');
const assert = require('node:assert');
const ext = require('../src/share');
const { groupKeys } = require('../src/groups');

const ALL = { cpu: true, gpu: true, disk: true, ram: true };
const conf = () => ({ show: Object.assign({}, ALL), diskDevices: [] });

test('le bail est libre tant que personne ne l a pris', () => {
  const fs = require('node:fs');
  try { fs.rmSync(ext.SHARE_FILE); } catch (_) { }
  assert.strictEqual(ext.claimLease(Date.now()), true);
});

test('le bail publie se rend au proprietaire et a lui seul', () => {
  const now = Date.now();
  ext.publishShare({ gpu: 42, disk: 7, disks: { 'sda': 7 }, ts: now, state: 'ok' }, now);
  assert.strictEqual(ext.claimLease(now), true, 'son propre bail reste le sien');

  const fs = require('node:fs');
  const s = JSON.parse(fs.readFileSync(ext.SHARE_FILE, 'utf8'));
  s.owner = 'une-autre-fenetre';
  fs.writeFileSync(ext.SHARE_FILE, JSON.stringify(s));
  assert.strictEqual(ext.claimLease(now), false, 'le bail d autrui ne se prend pas');
  assert.strictEqual(ext.claimLease(s.lease + 1), true, 'un bail expire se reprend');
});

test('l instantane partage rend les mesures publiees', () => {
  const now = Date.now();
  ext.publishShare({ gpu: 42, disk: 7, disks: { 'sda': 7 }, ts: now, state: 'ok' }, now);
  const snap = ext.sharedSnapshot();
  assert.strictEqual(snap.gpu, 42);
  assert.deepStrictEqual(snap.disks, { 'sda': 7 });
  assert.strictEqual(snap.ts, now);
  assert.deepStrictEqual(groupKeys(conf(), snap), ['cpu', 'gpu', 'disk:sda', 'ram']);
});

test('un partage absent ou vide ne rend aucun instantane', () => {
  const fs = require('node:fs');
  try { fs.rmSync(ext.SHARE_FILE); } catch (_) { }
  assert.strictEqual(ext.sharedSnapshot(), null);
  fs.writeFileSync(ext.SHARE_FILE, 'pas du json');
  assert.strictEqual(ext.sharedSnapshot(), null);
  try { fs.rmSync(ext.SHARE_FILE); } catch (_) { }
});


test('le partage transmet la swap Windows aux autres fenetres', () => {
  const fs = require('node:fs');
  const now = Date.now();
  ext.publishShare({ gpu: 1, disk: 2, disks: {}, swap: 33.5, ts: now, state: 'ok' }, now);
  assert.strictEqual(ext.sharedSnapshot().swap, 33.5);
  try { fs.rmSync(ext.SHARE_FILE); } catch (_) { }
});
