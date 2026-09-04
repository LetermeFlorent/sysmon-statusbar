const cp = require('node:child_process');

// macOS n'expose pas de "pourcentage d'occupation disque" sans privileges :
// iostat ne donne que des debits (KB/t, tps, MB/s) et fs_usage demande root.
// Plutot que de fabriquer un pourcentage a partir d'un debit, la sonde laisse
// le disque a null et l'affichage montre n/a.
//
// Le GPU passe par ioreg. Le nom de la classe change avec le materiel :
// IOAccelerator sur Intel et AMD, AGXAccelerator sur Apple Silicon.
const GPU_CLASSES = ['AGXAccelerator', 'IOAccelerator'];

// Les compteurs vivent dans le dictionnaire PerformanceStatistics, sous des
// cles dont le libelle varie selon le pilote.
const GPU_KEYS = [
  'Device Utilization %',
  'Renderer Utilization %',
  'GPU Activity(%)'
];

function parseIoregGpu(text) {
  const s = String(text || '');
  let max = null;
  for (const key of GPU_KEYS) {
    const re = new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*=\\s*(\\d+(?:\\.\\d+)?)', 'g');
    let mm;
    while ((mm = re.exec(s)) !== null) {
      const n = Number(mm[1]);
      if (!isFinite(n)) continue;
      const v = Math.max(0, Math.min(100, n));
      if (max === null || v > max) max = v;
    }
  }
  return max;
}

function queryIoreg(cls, cb) {
  cp.execFile('ioreg', ['-r', '-d', '1', '-w', '0', '-c', cls],
    { timeout: 4000, maxBuffer: 4 * 1024 * 1024 },
    (err, stdout) => cb(err ? null : parseIoregGpu(stdout)));
}

class MacProbe {
  constructor(intervalSeconds) {
    this.interval = Math.max(1, Number(intervalSeconds) || 2);
    this.timer = null;
    this.gpu = null;
    this.disk = null;
    this.disks = {};
    this.ts = 0;
    this.state = 'starting';
    this.gpuClass = null;
    this.querying = false;
    this.probed = false;
  }

  _query(cb) {
    if (this.gpuClass) { queryIoreg(this.gpuClass, cb); return; }
    // Premiere passe : on essaie chaque classe et on retient celle qui repond.
    let i = 0;
    const next = () => {
      if (i >= GPU_CLASSES.length) { cb(null); return; }
      const cls = GPU_CLASSES[i++];
      queryIoreg(cls, (v) => {
        if (v !== null) { this.gpuClass = cls; cb(v); return; }
        next();
      });
    };
    next();
  }

  _tick() {
    if (this.querying) return;
    this.querying = true;
    this._query((v) => {
      this.querying = false;
      this.probed = true;
      if (v === null) {
        if (this.state !== 'missing') this.state = this.gpuClass ? 'ok' : 'missing';
        return;
      }
      this.gpu = v;
      this.ts = Date.now();
      this.state = 'ok';
    });
  }

  start() {
    if (this.timer) return;
    this.state = 'starting';
    this._tick();
    this.timer = setInterval(() => this._tick(), this.interval * 1000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  restart() { this.stop(); this.start(); }

  snapshot() {
    return { gpu: this.gpu, disk: this.disk, disks: this.disks, ts: this.ts, state: this.state };
  }
}

module.exports = { parseIoregGpu, queryIoreg, MacProbe, GPU_CLASSES, GPU_KEYS };
