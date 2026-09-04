const test = require('node:test');
const assert = require('node:assert');
const p = require('../probe');

const HDR_EN = '"(PDH-CSV 4.0)","\\\\HOST\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage",' +
  '"\\\\HOST\\GPU Engine(pid_2_engtype_3D)\\Utilization Percentage",' +
  '"\\\\HOST\\PhysicalDisk(0 C:)\\% Disk Time",' +
  '"\\\\HOST\\PhysicalDisk(1 D:)\\% Disk Time",' +
  '"\\\\HOST\\PhysicalDisk(_Total)\\% Disk Time"';

const HDR_FR = '"(PDH-CSV 4.0)","\\\\HOST\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage",' +
  '"\\\\HOST\\Disque physique(0 C:)\\Pourcentage du temps disque",' +
  '"\\\\HOST\\Disque physique(_Total)\\Pourcentage du temps disque"';

test('columnKind reconnait le GPU et le disque, en anglais et en francais', () => {
  assert.strictEqual(p.columnKind('\\\\H\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage'), 'gpu');
  assert.strictEqual(p.columnKind('\\\\H\\PhysicalDisk(_Total)\\% Disk Time'), 'disk');
  assert.strictEqual(p.columnKind('\\\\H\\Disque physique(_Total)\\Pourcentage du temps disque'), 'disk');
  assert.strictEqual(p.columnKind('\\\\H\\Processor(_Total)\\% Idle Time'), null);
});

test('counterInstance extrait le contenu entre parentheses', () => {
  assert.strictEqual(p.counterInstance('\\\\H\\PhysicalDisk(0 C:)\\% Disk Time'), '0 C:');
  assert.strictEqual(p.counterInstance('\\\\H\\PhysicalDisk(_Total)\\% Disk Time'), '_Total');
  assert.strictEqual(p.counterInstance('sans parentheses'), null);
});

test('parseHeader donne le kind et l instance de chaque colonne disque', () => {
  const h = p.parseHeader(HDR_EN);
  assert.deepStrictEqual(h[0], { kind: 'gpu', instance: null });
  assert.deepStrictEqual(h[1], { kind: 'gpu', instance: null });
  assert.deepStrictEqual(h[2], { kind: 'disk', instance: '0 C:' });
  assert.deepStrictEqual(h[3], { kind: 'disk', instance: '1 D:' });
  assert.deepStrictEqual(h[4], { kind: 'disk', instance: '_Total' });
});

test('parseHeader rejette une ligne de valeurs', () => {
  assert.strictEqual(p.parseHeader('"09/03/2026 10:00:00.000","1.0","2.0"'), null);
  assert.strictEqual(p.parseHeader('bruit'), null);
});

test('parseValues additionne le GPU, isole le total et le detail par disque', () => {
  const kinds = p.parseHeader(HDR_EN);
  const v = p.parseValues('"09/03/2026 10:00:00.000","1.5","2.25","12.0","3.0","7.229238"', kinds);
  assert.strictEqual(v.gpu, 3.75);
  assert.ok(Math.abs(v.disk - 7.229238) < 1e-9);
  assert.deepStrictEqual(v.disks, { '0 C:': 12, '1 D:': 3 });
});

test('parseValues accepte la virgule decimale', () => {
  const kinds = p.parseHeader(HDR_FR);
  const v = p.parseValues('"09/03/2026 10:00:00.000","4,5","8,0","12,25"', kinds);
  assert.strictEqual(v.gpu, 4.5);
  assert.strictEqual(v.disk, 12.25);
  assert.deepStrictEqual(v.disks, { '0 C:': 8 });
});

test('parseValues plafonne chaque colonne a cent', () => {
  const kinds = p.parseHeader(HDR_EN);
  const v = p.parseValues('"09/03/2026 10:00:00.000","80.0","50.0","150.0","0.0","640.0"', kinds);
  assert.strictEqual(v.gpu, 100);
  assert.strictEqual(v.disk, 100);
  assert.strictEqual(v.disks['0 C:'], 100);
});

test('parseValues rend null sur l en-tete ou du bruit', () => {
  const kinds = p.parseHeader(HDR_EN);
  assert.strictEqual(p.parseValues(HDR_EN, kinds), null);
  assert.strictEqual(p.parseValues('Fin de la collecte', kinds), null);
  assert.strictEqual(p.parseValues('"09/03/2026 10:00:00.000","1.0"', null), null);
});

test('parseValues laisse le gpu a null si aucune colonne gpu n a de valeur', () => {
  const kinds = p.parseHeader(HDR_FR);
  const v = p.parseValues('"09/03/2026 10:00:00.000"," ","5.0","3.0"', kinds);
  assert.strictEqual(v.gpu, null);
  assert.strictEqual(v.disk, 3);
  assert.deepStrictEqual(v.disks, { '0 C:': 5 });
});

test('une sonde jamais demarree est en etat starting', () => {
  const s = new p.Probe().snapshot();
  assert.strictEqual(s.state, 'starting');
  assert.strictEqual(s.gpu, null);
  assert.strictEqual(s.disk, null);
  assert.deepStrictEqual(s.disks, {});
});

test('la sonde apprend l en-tete puis retient les valeurs', () => {
  const probe = new p.Probe();
  probe._ingest(HDR_EN);
  probe._ingest('"09/03/2026 10:00:00.000","4.0","2.0","20.0","10.0","9.0"');
  const s = probe.snapshot();
  assert.strictEqual(s.state, 'ok');
  assert.strictEqual(s.gpu, 6);
  assert.strictEqual(s.disk, 9);
  assert.deepStrictEqual(s.disks, { '0 C:': 20, '1 D:': 10 });
  assert.ok(Date.now() - s.ts < 1000);
});

test('sans en-tete la sonde ne retient rien', () => {
  const probe = new p.Probe();
  probe._ingest('"09/03/2026 10:00:00.000","4.0","2.0","20.0","10.0","9.0"');
  const s = probe.snapshot();
  assert.strictEqual(s.state, 'starting');
  assert.strictEqual(s.gpu, null);
});

test('la sonde ignore les lignes non parsables apres coup', () => {
  const probe = new p.Probe();
  probe._ingest(HDR_EN);
  probe._ingest('"09/03/2026 10:00:00.000","4.0","0.0","20.0","10.0","9.0"');
  probe._ingest('Fin de la collecte');
  assert.strictEqual(probe.snapshot().gpu, 4);
  assert.strictEqual(probe.snapshot().disk, 9);
});

test('stop sur une sonde jamais demarree ne jette pas', () => {
  assert.doesNotThrow(() => new p.Probe().stop());
});

test('la liste de compteurs couvre les deux locales et interroge tous les disques', () => {
  assert.ok(p.COUNTERS.some(c => /GPU Engine/.test(c)));
  assert.ok(p.COUNTERS.some(c => /PhysicalDisk\(\*\)/.test(c)));
  assert.ok(p.COUNTERS.some(c => /Disque physique\(\*\)/.test(c)));
});
