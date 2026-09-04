const test = require('node:test');
const assert = require('node:assert');
const mac = require('../mac');

const IOREG_INTEL = [
  '+-o IntelAccelerator  <class IOAccelerator, id 0x100000abc, registered>',
  '    {',
  '      "PerformanceStatistics" = {"Device Utilization %"=37,"Renderer Utilization %"=12,"Alloc system memory"=123456}',
  '      "IOClass" = "IntelAccelerator"',
  '    }'
].join('\n');

const IOREG_AGX = [
  '+-o AGXAcceleratorG13X  <class AGXAccelerator, id 0x100000def, registered>',
  '    {',
  '      "PerformanceStatistics" = {"Alloc system memory"=98765,"Device Utilization %"=6}',
  '    }'
].join('\n');

test('parseIoregGpu lit le pourcentage d utilisation', () => {
  assert.strictEqual(mac.parseIoregGpu(IOREG_INTEL), 37);
  assert.strictEqual(mac.parseIoregGpu(IOREG_AGX), 6);
});

test('parseIoregGpu retient la valeur la plus haute parmi les cles connues', () => {
  const t = '"Renderer Utilization %"=80,"Device Utilization %"=20';
  assert.strictEqual(mac.parseIoregGpu(t), 80);
});

test('parseIoregGpu accepte les decimales et borne a 100', () => {
  assert.strictEqual(mac.parseIoregGpu('"Device Utilization %"=12.5'), 12.5);
  assert.strictEqual(mac.parseIoregGpu('"Device Utilization %"=340'), 100);
});

test('parseIoregGpu ne retourne rien sur une sortie sans compteur connu', () => {
  assert.strictEqual(mac.parseIoregGpu(''), null);
  assert.strictEqual(mac.parseIoregGpu('+-o Root  <class IORegistryEntry>'), null);
  assert.strictEqual(mac.parseIoregGpu('"Alloc system memory"=4096'), null);
});

test('parseIoregGpu ne confond pas une cle voisine avec la sienne', () => {
  assert.strictEqual(mac.parseIoregGpu('"Not Device Utilization %x"=55'), null);
});

test('parseIoregGpu encaisse une entree non textuelle', () => {
  assert.strictEqual(mac.parseIoregGpu(null), null);
  assert.strictEqual(mac.parseIoregGpu(undefined), null);
});

test('la sonde mac laisse le disque a null, macOS ne l expose pas', () => {
  const p = new mac.MacProbe(2);
  const s = p.snapshot();
  assert.strictEqual(s.disk, null);
  assert.deepStrictEqual(s.disks, {});
  assert.strictEqual(s.state, 'starting');
});

test('stop sur une sonde mac jamais demarree ne jette pas', () => {
  const p = new mac.MacProbe(2);
  assert.doesNotThrow(() => p.stop());
});

test('la sonde mac borne son intervalle comme les sondes Windows et Linux', () => {
  assert.strictEqual(new mac.MacProbe(0).interval, 2, 'zero retombe sur le defaut');
  assert.strictEqual(new mac.MacProbe(-5).interval, 1, 'un negatif est ramene au plancher');
  assert.strictEqual(new mac.MacProbe(10).interval, 10);
});

test('les classes interrogees couvrent Apple Silicon et Intel', () => {
  assert.ok(mac.GPU_CLASSES.includes('AGXAccelerator'));
  assert.ok(mac.GPU_CLASSES.includes('IOAccelerator'));
});
