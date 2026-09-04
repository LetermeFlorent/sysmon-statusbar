const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// extension.js parle a l'API VS Code, absente en test : un double suffit pour
// charger le module et exercer ses fonctions d'affichage.
const fakeVscode = {
  StatusBarAlignment: { Left: 1, Right: 2 },
  ConfigurationTarget: { Global: 1 },
  MarkdownString: class {
    constructor() { this.value = ''; }
    appendMarkdown(s) { this.value += s; return this; }
  },
  workspace: {
    getConfiguration() { return { get() { }, update() { return Promise.resolve(); } }; },
    onDidChangeConfiguration() { return { dispose() { } }; }
  },
  window: {
    state: { focused: true },
    createStatusBarItem() { return { show() { }, hide() { }, dispose() { } }; },
    onDidChangeWindowState() { return { dispose() { } }; },
    showInformationMessage() { },
    showQuickPick() { return Promise.resolve(undefined); }
  },
  commands: { registerCommand() { return { dispose() { } }; } }
};

const origLoad = Module._load;
Module._load = function (req) {
  return req === 'vscode' ? fakeVscode : origLoad.apply(this, arguments);
};

const ext = require('../extension');

const ALL = { cpu: true, gpu: true, disk: true, ram: true };
const conf = (over) => Object.assign({ show: Object.assign({}, ALL), diskDevices: [] }, over || {});
const snapOf = (disks) => ({ gpu: 10, disk: 20, disks: disks, ts: Date.now(), state: 'ok' });

test('shortDiskName retire le numero d instance Windows', () => {
  assert.strictEqual(ext.shortDiskName('0 C:'), 'C:');
  assert.strictEqual(ext.shortDiskName('1 D: E:'), 'D: E:');
  assert.strictEqual(ext.shortDiskName('12 Z:'), 'Z:');
});

test('shortDiskName laisse un nom Linux intact', () => {
  assert.strictEqual(ext.shortDiskName('sda'), 'sda');
  assert.strictEqual(ext.shortDiskName('nvme0n1'), 'nvme0n1');
});

test('shortDiskName encaisse une entree vide', () => {
  assert.strictEqual(ext.shortDiskName(''), '');
  assert.strictEqual(ext.shortDiskName(null), '');
});

test('un groupe par disque, dans l ordre alphabetique', () => {
  const keys = ext.groupKeys(conf(), snapOf({ '1 D:': 5, '0 C:': 40 }));
  assert.deepStrictEqual(keys, ['cpu', 'gpu', 'disk:0 C:', 'disk:1 D:', 'ram']);
});

test('le libelle d un groupe disque est le nom court du disque', () => {
  assert.strictEqual(ext.labelFor('disk:0 C:'), 'C:');
  assert.strictEqual(ext.labelFor('disk:sda'), 'sda');
  assert.strictEqual(ext.labelFor('cpu'), 'CPU');
  assert.strictEqual(ext.labelFor('ram'), 'RAM');
});

test('une liste vide affiche tous les disques vus', () => {
  const disks = { 'sda': 3, 'sdb': 9 };
  assert.deepStrictEqual(ext.visibleDisks(conf(), snapOf(disks)), ['sda', 'sdb']);
});

test('une liste non vide ne garde que les disques coches', () => {
  const snap = snapOf({ '0 C:': 40, '1 D:': 5, '2 E:': 1 });
  const c = conf({ diskDevices: ['0 C:', '2 E:'] });
  assert.deepStrictEqual(ext.visibleDisks(c, snap), ['0 C:', '2 E:']);
  assert.deepStrictEqual(ext.groupKeys(c, snap), ['cpu', 'gpu', 'disk:0 C:', 'disk:2 E:', 'ram']);
});

test('un disque coche mais disparu ne cree pas de groupe fantome', () => {
  const c = conf({ diskDevices: ['0 C:', '9 Z:'] });
  assert.deepStrictEqual(ext.visibleDisks(c, snapOf({ '0 C:': 40 })), ['0 C:']);
});

test('tout decocher n affiche aucun groupe disque', () => {
  const c = conf({ diskDevices: ['9 Z:'] });
  assert.deepStrictEqual(ext.groupKeys(c, snapOf({ '0 C:': 40 })), ['cpu', 'gpu', 'ram']);
});

test('tant qu aucun disque n est connu, un seul groupe DISK patiente', () => {
  assert.deepStrictEqual(ext.groupKeys(conf(), snapOf({})), ['cpu', 'gpu', 'disk', 'ram']);
  assert.deepStrictEqual(ext.groupKeys(conf(), null), ['cpu', 'gpu', 'disk', 'ram']);
  assert.strictEqual(ext.labelFor('disk'), 'DISK');
});

test('showDisk a false retire tous les groupes disque', () => {
  const c = conf({ show: { cpu: true, gpu: true, disk: false, ram: true } });
  assert.deepStrictEqual(ext.groupKeys(c, snapOf({ 'sda': 3, 'sdb': 9 })), ['cpu', 'gpu', 'ram']);
});

test('chaque groupe masque disparait de la liste', () => {
  const c = conf({ show: { cpu: false, gpu: false, disk: true, ram: false } });
  assert.deepStrictEqual(ext.groupKeys(c, snapOf({ 'sda': 3 })), ['disk:sda']);
});

test('les noms Linux de /proc/diskstats donnent un groupe chacun', () => {
  const snap = snapOf({ 'nvme0n1': 12, 'sda': 4 });
  assert.deepStrictEqual(ext.groupKeys(conf(), snap),
    ['cpu', 'gpu', 'disk:nvme0n1', 'disk:sda', 'ram']);
  assert.strictEqual(ext.labelFor('disk:nvme0n1'), 'nvme0n1');
});

test('la sonde macOS ne remonte aucun disque, le groupe DISK reste seul', () => {
  const { MacProbe } = require('../mac');
  const snap = new MacProbe(2).snapshot();
  assert.deepStrictEqual(snap.disks, {}, 'macOS ne mesure pas le disque');
  assert.deepStrictEqual(ext.visibleDisks(conf(), snap), []);
  assert.deepStrictEqual(ext.groupKeys(conf(), snap), ['cpu', 'gpu', 'disk', 'ram']);
});

test('le bail est libre tant que personne ne l a pris', () => {
  const fs = require('node:fs');
  try { fs.rmSync(ext.SHARE_FILE); } catch (_) { /* deja absent */ }
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
  assert.deepStrictEqual(ext.groupKeys(conf(), snap), ['cpu', 'gpu', 'disk:sda', 'ram']);
});

test('un partage absent ou vide ne rend aucun instantane', () => {
  const fs = require('node:fs');
  try { fs.rmSync(ext.SHARE_FILE); } catch (_) { /* deja absent */ }
  assert.strictEqual(ext.sharedSnapshot(), null);
  fs.writeFileSync(ext.SHARE_FILE, 'pas du json');
  assert.strictEqual(ext.sharedSnapshot(), null);
  try { fs.rmSync(ext.SHARE_FILE); } catch (_) { /* deja absent */ }
});

test('une sonde Windows ou Linux fraiche part elle aussi sur DISK', () => {
  const { Probe } = require('../probe');
  const { LinuxProbe } = require('../linux');
  for (const p of [new Probe(2), new LinuxProbe(2)]) {
    assert.deepStrictEqual(ext.groupKeys(conf(), p.snapshot()), ['cpu', 'gpu', 'disk', 'ram']);
  }
});
