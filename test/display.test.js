const test = require('node:test');
const assert = require('node:assert');
const ext = require('../src/groups');

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
  const { MacProbe } = require('../src/probes/mac');
  const snap = new MacProbe(2).snapshot();
  assert.deepStrictEqual(snap.disks, {}, 'macOS ne mesure pas le disque');
  assert.deepStrictEqual(ext.visibleDisks(conf(), snap), []);
  assert.deepStrictEqual(ext.groupKeys(conf(), snap), ['cpu', 'gpu', 'disk', 'ram']);
});

test('une sonde Windows ou Linux fraiche part elle aussi sur DISK', () => {
  const { Probe } = require('../src/probes/windows');
  const { LinuxProbe } = require('../src/probes/linux');
  for (const p of [new Probe(2), new LinuxProbe(2)]) {
    assert.deepStrictEqual(ext.groupKeys(conf(), p.snapshot()), ['cpu', 'gpu', 'disk', 'ram']);
  }
});

test('sans choix, un seul groupe CPU et un seul groupe GPU', () => {
  assert.deepStrictEqual(ext.deviceKeys('gpu', [], ['0', '1']), ['gpu']);
});

test('les coeurs et GPU coches donnent un groupe chacun, global en tete', () => {
  assert.deepStrictEqual(ext.deviceKeys('cpu', ['all', '3', '0'], ['0', '1', '2', '3']), ['cpu', 'cpu:0', 'cpu:3']);
  assert.deepStrictEqual(ext.deviceKeys('gpu', ['1'], ['0', '1']), ['gpu:1']);
});

test('un GPU coche mais absent retombe sur le groupe global', () => {
  assert.deepStrictEqual(ext.deviceKeys('gpu', ['5'], ['0']), ['gpu']);
  assert.deepStrictEqual(ext.deviceKeys('gpu', ['0'], []), ['gpu']);
});

test('les GPU connus se trient par numero', () => {
  assert.deepStrictEqual(ext.knownGpus({ gpus: { 'card10': 1, 'card2': 1 } }), ['card2', 'card10']);
});

test('libelles des groupes coeur et GPU', () => {
  assert.strictEqual(ext.labelFor('cpu:4'), 'C4');
  assert.strictEqual(ext.labelFor('gpu:1'), 'GPU1');
  assert.strictEqual(ext.labelFor('gpu:card0'), 'card0');
});

test('le groupe SWAP suit la RAM quand il est affiche', () => {
  const c = conf({ show: { cpu: false, gpu: false, disk: false, ram: true, swap: true } });
  assert.deepStrictEqual(ext.groupKeys(c, null), ['ram', 'swap']);
  assert.strictEqual(ext.labelFor('swap'), 'SWAP');
});
