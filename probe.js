const cp = require('node:child_process');

// typeperf ne comprend que les noms localises : sur un Windows francais
// "\PhysicalDisk(_Total)\% Disk Time" est refuse. Il accepte en revanche une
// liste ou seuls certains compteurs sont valides, du moment qu'il en reste un.
// On passe donc toutes les variantes connues et on resout les colonnes en
// lisant l'en-tete CSV qu'il renvoie.
const COUNTERS = [
  '\\GPU Engine(*engtype_3D)\\Utilization Percentage',
  '\\Moteur GPU(*engtype_3D)\\Pourcentage d\'utilisation',
  '\\PhysicalDisk(_Total)\\% Disk Time',
  '\\Disque physique(_Total)\\Pourcentage du temps disque'
];

function columnKind(name) {
  const n = String(name || '');
  if (/GPU Engine|Moteur GPU/i.test(n)) return 'gpu';
  if (/Disk Time|temps disque|PhysicalDisk|Disque physique/i.test(n)) return 'disk';
  return null;
}

function splitCsv(line) {
  const s = String(line || '').trim();
  if (!s || s[0] !== '"') return null;
  return s.replace(/^"/, '').replace(/"$/, '').split('","');
}

function parseHeader(line) {
  const cols = splitCsv(line);
  if (!cols || cols.length < 2 || cols[0].indexOf('PDH-CSV') < 0) return null;
  return cols.slice(1).map(columnKind);
}

function parseValues(line, kinds) {
  if (!kinds) return null;
  const cols = splitCsv(line);
  if (!cols || cols.length < 2 || cols[0].indexOf('PDH-CSV') >= 0) return null;
  const sums = { gpu: null, disk: null };
  for (let i = 1; i < cols.length; i++) {
    const kind = kinds[i - 1];
    if (!kind) continue;
    const n = parseFloat(cols[i].replace(/"/g, '').trim().replace(',', '.'));
    if (!isFinite(n)) continue;
    sums[kind] = (sums[kind] === null ? 0 : sums[kind]) + n;
  }
  if (sums.gpu === null && sums.disk === null) return null;
  for (const k of ['gpu', 'disk']) {
    if (sums[k] !== null) sums[k] = Math.max(0, Math.min(100, sums[k]));
  }
  return sums;
}

class Probe {
  constructor(intervalSeconds) {
    this.interval = Math.max(1, Number(intervalSeconds) || 2);
    this.proc = null;
    this.buf = '';
    this.kinds = null;
    this.gpu = null;
    this.disk = null;
    this.ts = 0;
    this.state = 'starting';
  }

  _ingest(line) {
    if (!this.kinds) {
      const h = parseHeader(line);
      if (h) { this.kinds = h; return; }
    }
    const v = parseValues(line, this.kinds);
    if (!v) return;
    if (v.gpu !== null) this.gpu = v.gpu;
    if (v.disk !== null) this.disk = v.disk;
    this.ts = Date.now();
    this.state = 'ok';
  }

  start() {
    if (this.proc) return;
    this.state = 'starting';
    this.kinds = null;
    let p;
    try {
      p = cp.spawn('typeperf', COUNTERS.concat(['-si', String(this.interval)]), {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (_) {
      this.state = 'missing';
      return;
    }
    this.proc = p;
    p.on('error', () => { this.state = 'missing'; this.proc = null; });
    p.on('exit', () => {
      if (this.proc === p) {
        this.proc = null;
        if (this.state !== 'missing') this.state = 'error';
      }
    });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk) => {
      this.buf += chunk;
      const lines = this.buf.split(/\r?\n/);
      this.buf = lines.pop();
      for (const l of lines) this._ingest(l);
    });
    p.stderr.resume();
  }

  stop() {
    const p = this.proc;
    this.proc = null;
    this.buf = '';
    this.kinds = null;
    if (p) { try { p.kill(); } catch (_) { } }
  }

  restart() {
    this.stop();
    this.start();
  }

  snapshot() {
    return { gpu: this.gpu, disk: this.disk, ts: this.ts, state: this.state };
  }
}

module.exports = { parseHeader, parseValues, columnKind, Probe, COUNTERS };
