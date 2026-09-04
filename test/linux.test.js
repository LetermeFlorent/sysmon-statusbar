const test = require('node:test');
const assert = require('node:assert');
const l = require('../linux');

test('isWholeDisk accepte les disques entiers', () => {
  assert.ok(l.isWholeDisk('sda'));
  assert.ok(l.isWholeDisk('vda'));
  assert.ok(l.isWholeDisk('nvme0n1'));
  assert.ok(l.isWholeDisk('mmcblk0'));
});

test('isWholeDisk rejette les partitions et devices virtuels', () => {
  assert.ok(!l.isWholeDisk('sda1'));
  assert.ok(!l.isWholeDisk('nvme0n1p1'));
  assert.ok(!l.isWholeDisk('loop0'));
  assert.ok(!l.isWholeDisk('dm-0'));
  assert.ok(!l.isWholeDisk('ram0'));
});

const FIXTURE = [
  '   8       0 sda 100 0 2000 50 200 0 4000 100 0 150 150 0 0 0 0 0',
  '   8       1 sda1 90 0 1800 40 180 0 3600 90 0 130 130 0 0 0 0 0',
  '   7       0 loop0 5 0 10 1 0 0 0 0 0 1 1 0 0 0 0 0',
  ' 259       0 nvme0n1 500 0 9000 200 800 0 16000 400 0 600 600 0 0 0 0 0'
].join('\n');

test('parseDiskStats ne retient que les disques entiers', () => {
  const d = l.parseDiskStats(FIXTURE);
  assert.deepStrictEqual(Object.keys(d).sort(), ['nvme0n1', 'sda']);
  assert.strictEqual(d.sda, 150);
  assert.strictEqual(d.nvme0n1, 600);
});

test('parseDiskStats ignore une ligne trop courte ou vide', () => {
  const d = l.parseDiskStats('bruit\n\n   8 0 sda 1 2 3');
  assert.deepStrictEqual(d, {});
});

test('diskPercent calcule le pourcentage du disque le plus charge', () => {
  const prev = { sda: 150, nvme0n1: 600 };
  const cur = { sda: 650, nvme0n1: 700 };
  // sda : (650-150)/1000*100 = 50%, nvme0n1 : (700-600)/1000*100 = 10%
  assert.strictEqual(l.diskPercent(prev, 0, cur, 1000), 50);
});

test('diskPercent rend null sans intervalle de temps positif', () => {
  assert.strictEqual(l.diskPercent({ sda: 1 }, 1000, { sda: 2 }, 1000), null);
  assert.strictEqual(l.diskPercent({ sda: 1 }, 1000, { sda: 2 }, 500), null);
});

test('diskPercent ignore un compteur qui repart en arriere', () => {
  const prev = { sda: 900 };
  const cur = { sda: 100 };
  assert.strictEqual(l.diskPercent(prev, 0, cur, 1000), null);
});

test('diskPercent plafonne a cent', () => {
  const prev = { sda: 0 };
  const cur = { sda: 5000 };
  assert.strictEqual(l.diskPercent(prev, 0, cur, 1000), 100);
});

test('diskPercents rend le pourcentage de chaque disque, pas seulement le max', () => {
  const prev = { sda: 150, nvme0n1: 600 };
  const cur = { sda: 650, nvme0n1: 700 };
  assert.deepStrictEqual(l.diskPercents(prev, 0, cur, 1000), { sda: 50, nvme0n1: 10 });
});

test('diskPercents omet un disque absent d un des deux releves', () => {
  const prev = { sda: 100 };
  const cur = { sda: 200, nvme0n1: 50 };
  assert.deepStrictEqual(l.diskPercents(prev, 0, cur, 1000), { sda: 10 });
});

test('diskPercents rend un objet vide sans intervalle de temps positif', () => {
  assert.deepStrictEqual(l.diskPercents({ sda: 1 }, 1000, { sda: 2 }, 1000), {});
});

test('parseNvidiaSmiOutput additionne les lignes numeriques', () => {
  assert.strictEqual(l.parseNvidiaSmiOutput('13\n27\n'), 40);
  assert.strictEqual(l.parseNvidiaSmiOutput('45'), 45);
});

test('parseNvidiaSmiOutput rend null sans ligne exploitable', () => {
  assert.strictEqual(l.parseNvidiaSmiOutput(''), null);
  assert.strictEqual(l.parseNvidiaSmiOutput('N/A\n'), null);
});

test('parseNvidiaSmiOutput plafonne a cent', () => {
  assert.strictEqual(l.parseNvidiaSmiOutput('80\n50\n'), 100);
});
