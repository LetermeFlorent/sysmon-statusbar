const test = require('node:test');
const assert = require('node:assert');
const g = require('../gpu');

test('parseCsvLine ignore la ligne d en-tete', () => {
  const header = '"(PDH-CSV 4.0)","\\\\HOST\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage"';
  assert.strictEqual(g.parseCsvLine(header), null);
});

test('parseCsvLine ignore une ligne vide ou du bruit', () => {
  assert.strictEqual(g.parseCsvLine(''), null);
  assert.strictEqual(g.parseCsvLine('   '), null);
  assert.strictEqual(g.parseCsvLine('Fin de la collecte'), null);
});

test('parseCsvLine somme les colonnes de valeurs', () => {
  const line = '"09/03/2026 10:00:00.000","1.500000","2.250000","0.000000"';
  assert.strictEqual(g.parseCsvLine(line), 3.75);
});

test('parseCsvLine accepte la virgule decimale des locales FR', () => {
  const line = '"09/03/2026 10:00:00.000","1,500000","2,250000"';
  assert.strictEqual(g.parseCsvLine(line), 3.75);
});

test('parseCsvLine plafonne a cent', () => {
  const line = '"09/03/2026 10:00:00.000","80.0","50.0"';
  assert.strictEqual(g.parseCsvLine(line), 100);
});

test('parseCsvLine traite les colonnes non numeriques comme zero', () => {
  const line = '"09/03/2026 10:00:00.000"," ","5.0"';
  assert.strictEqual(g.parseCsvLine(line), 5);
});

test('parseCsvLine rend null si la ligne n a que l horodatage', () => {
  assert.strictEqual(g.parseCsvLine('"09/03/2026 10:00:00.000"'), null);
});

test('une sonde jamais demarree est en etat starting', () => {
  const p = new g.GpuProbe();
  const s = p.snapshot();
  assert.strictEqual(s.state, 'starting');
  assert.strictEqual(s.pct, null);
});

test('la sonde retient la derniere valeur poussee', () => {
  const p = new g.GpuProbe();
  p._ingest('"09/03/2026 10:00:00.000","4.0","2.0"');
  const s = p.snapshot();
  assert.strictEqual(s.state, 'ok');
  assert.strictEqual(s.pct, 6);
  assert.ok(Date.now() - s.ts < 1000);
});

test('la sonde ne retient pas les lignes non parsables', () => {
  const p = new g.GpuProbe();
  p._ingest('"09/03/2026 10:00:00.000","4.0"');
  p._ingest('Fin de la collecte');
  assert.strictEqual(p.snapshot().pct, 4);
});

test('stop sur une sonde jamais demarree ne jette pas', () => {
  const p = new g.GpuProbe();
  assert.doesNotThrow(() => p.stop());
});
