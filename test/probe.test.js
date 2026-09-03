const test = require('node:test');
const assert = require('node:assert');
const p = require('../probe');

const HDR_EN = '"(PDH-CSV 4.0)","\\\\HOST\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage",' +
  '"\\\\HOST\\GPU Engine(pid_2_engtype_3D)\\Utilization Percentage",' +
  '"\\\\HOST\\PhysicalDisk(_Total)\\% Disk Time"';

const HDR_FR = '"(PDH-CSV 4.0)","\\\\HOST\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage",' +
  '"\\\\HOST\\Disque physique(_Total)\\Pourcentage du temps disque"';

test('columnKind reconnait le GPU et le disque, en anglais et en francais', () => {
  assert.strictEqual(p.columnKind('\\\\H\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage'), 'gpu');
  assert.strictEqual(p.columnKind('\\\\H\\PhysicalDisk(_Total)\\% Disk Time'), 'disk');
  assert.strictEqual(p.columnKind('\\\\H\\Disque physique(_Total)\\Pourcentage du temps disque'), 'disk');
  assert.strictEqual(p.columnKind('\\\\H\\Processor(_Total)\\% Idle Time'), null);
});

test('parseHeader mappe chaque colonne a sa categorie', () => {
  assert.deepStrictEqual(p.parseHeader(HDR_EN), ['gpu', 'gpu', 'disk']);
  assert.deepStrictEqual(p.parseHeader(HDR_FR), ['gpu', 'disk']);
});

test('parseHeader rejette une ligne de valeurs', () => {
  assert.strictEqual(p.parseHeader('"09/03/2026 10:00:00.000","1.0","2.0"'), null);
  assert.strictEqual(p.parseHeader('bruit'), null);
});

test('parseValues additionne le GPU et garde le disque separe', () => {
  const kinds = p.parseHeader(HDR_EN);
  const v = p.parseValues('"09/03/2026 10:00:00.000","1.500000","2.250000","7.229238"', kinds);
  assert.strictEqual(v.gpu, 3.75);
  assert.ok(Math.abs(v.disk - 7.229238) < 1e-9);
});

test('parseValues accepte la virgule decimale', () => {
  const kinds = p.parseHeader(HDR_FR);
  const v = p.parseValues('"09/03/2026 10:00:00.000","4,5","12,25"', kinds);
  assert.strictEqual(v.gpu, 4.5);
  assert.strictEqual(v.disk, 12.25);
});

test('parseValues plafonne chaque categorie a cent', () => {
  const kinds = p.parseHeader(HDR_EN);
  const v = p.parseValues('"09/03/2026 10:00:00.000","80.0","50.0","640.0"', kinds);
  assert.strictEqual(v.gpu, 100);
  assert.strictEqual(v.disk, 100);
});

test('parseValues rend null sur l en-tete ou du bruit', () => {
  const kinds = p.parseHeader(HDR_EN);
  assert.strictEqual(p.parseValues(HDR_EN, kinds), null);
  assert.strictEqual(p.parseValues('Fin de la collecte', kinds), null);
  assert.strictEqual(p.parseValues('"09/03/2026 10:00:00.000","1.0"', null), null);
});

test('parseValues laisse une categorie absente a null', () => {
  const kinds = p.parseHeader(HDR_FR);
  const v = p.parseValues('"09/03/2026 10:00:00.000"," ","3.0"', kinds);
  assert.strictEqual(v.gpu, null);
  assert.strictEqual(v.disk, 3);
});

test('une sonde jamais demarree est en etat starting', () => {
  const s = new p.Probe().snapshot();
  assert.strictEqual(s.state, 'starting');
  assert.strictEqual(s.gpu, null);
  assert.strictEqual(s.disk, null);
});

test('la sonde apprend l en-tete puis retient les valeurs', () => {
  const probe = new p.Probe();
  probe._ingest(HDR_EN);
  probe._ingest('"09/03/2026 10:00:00.000","4.0","2.0","9.0"');
  const s = probe.snapshot();
  assert.strictEqual(s.state, 'ok');
  assert.strictEqual(s.gpu, 6);
  assert.strictEqual(s.disk, 9);
  assert.ok(Date.now() - s.ts < 1000);
});

test('sans en-tete la sonde ne retient rien', () => {
  const probe = new p.Probe();
  probe._ingest('"09/03/2026 10:00:00.000","4.0","2.0","9.0"');
  const s = probe.snapshot();
  assert.strictEqual(s.state, 'starting');
  assert.strictEqual(s.gpu, null);
});

test('la sonde ignore les lignes non parsables apres coup', () => {
  const probe = new p.Probe();
  probe._ingest(HDR_EN);
  probe._ingest('"09/03/2026 10:00:00.000","4.0","0.0","9.0"');
  probe._ingest('Fin de la collecte');
  assert.strictEqual(probe.snapshot().gpu, 4);
  assert.strictEqual(probe.snapshot().disk, 9);
});

test('stop sur une sonde jamais demarree ne jette pas', () => {
  assert.doesNotThrow(() => new p.Probe().stop());
});

test('la liste de compteurs couvre les deux locales', () => {
  assert.ok(p.COUNTERS.some(c => /GPU Engine/.test(c)));
  assert.ok(p.COUNTERS.some(c => /PhysicalDisk/.test(c)));
  assert.ok(p.COUNTERS.some(c => /Disque physique/.test(c)));
});
