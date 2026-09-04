const cp = require('node:child_process');

// typeperf ne comprend que les noms localises : sur un Windows francais
// "\PhysicalDisk(_Total)\% Disk Time" est refuse. Il accepte en revanche une
// liste ou seuls certains compteurs sont valides, du moment qu'il en reste un.
// On passe donc toutes les variantes connues et on resout les colonnes en
// lisant l'en-tete CSV qu'il renvoie.
//
// Le disque est demande avec le joker (*) et non (_Total) : Windows ramene
// alors une colonne par disque physique (ex. "0 C:") PLUS une colonne
// _Total agregee, dans le meme flux, sans compteur supplementaire.
const COUNTERS = [
  '\\GPU Engine(*engtype_3D)\\Utilization Percentage',
  '\\Moteur GPU(*engtype_3D)\\Pourcentage d\'utilisation',
  '\\PhysicalDisk(*)\\% Disk Time',
  '\\Disque physique(*)\\Pourcentage du temps disque'
];

// Extrait la partie entre parentheses d'un nom de compteur PDH, ex.
// "\\HOST\Disque physique(0 C:)\Pourcentage du temps disque" -> "0 C:".
function counterInstance(name) {
  const m = /\(([^)]*)\)/.exec(String(name || ''));
  return m ? m[1] : null;
}

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

// Retourne, par colonne, { kind, instance }. instance ne sert que pour
// 'disk' : le GPU reste agrege tel quel, aucun besoin de le ventiler par
// moteur/process pour cette extension.
function parseHeader(line) {
  const cols = splitCsv(line);
  if (!cols || cols.length < 2 || cols[0].indexOf('PDH-CSV') < 0) return null;
  return cols.slice(1).map((name) => {
    const kind = columnKind(name);
    if (!kind) return null;
    return { kind, instance: kind === 'disk' ? counterInstance(name) : null };
  });
}

function parseValues(line, kinds) {
  if (!kinds) return null;
  const cols = splitCsv(line);
  if (!cols || cols.length < 2 || cols[0].indexOf('PDH-CSV') >= 0) return null;
  let gpu = null;
  let diskTotal = null;
  const disks = {};
  let sawDisk = false;
  for (let i = 1; i < cols.length; i++) {
    const col = kinds[i - 1];
    if (!col) continue;
    const n = parseFloat(cols[i].replace(/"/g, '').trim().replace(',', '.'));
    if (!isFinite(n)) continue;
    const v = Math.max(0, Math.min(100, n));
    if (col.kind === 'gpu') {
      gpu = (gpu === null ? 0 : gpu) + v;
    } else if (col.kind === 'disk') {
      sawDisk = true;
      if (col.instance === '_Total') {
        diskTotal = v;
      } else if (col.instance) {
        disks[col.instance] = v;
      }
    }
  }
  if (gpu === null && !sawDisk) return null;
  if (gpu !== null) gpu = Math.max(0, Math.min(100, gpu));
  return { gpu, disk: diskTotal, disks: sawDisk ? disks : null };
}

class Probe {
  constructor(intervalSeconds) {
    this.interval = Math.max(1, Number(intervalSeconds) || 2);
    this.proc = null;
    this.buf = '';
    this.kinds = null;
    this.gpu = null;
    this.disk = null;
    this.disks = {};
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
    if (v.disks) this.disks = v.disks;
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
    return { gpu: this.gpu, disk: this.disk, disks: this.disks, ts: this.ts, state: this.state };
  }
}

module.exports = { parseHeader, parseValues, columnKind, counterInstance, Probe, COUNTERS };
