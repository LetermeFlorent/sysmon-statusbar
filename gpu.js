const cp = require('node:child_process');

const COUNTER = '\\GPU Engine(*engtype_3D)\\Utilization Percentage';

function parseCsvLine(line) {
  const s = String(line || '').trim();
  if (!s || s[0] !== '"') return null;
  if (s.indexOf('PDH-CSV') >= 0) return null;
  const cols = s.split('","');
  if (cols.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < cols.length; i++) {
    const raw = cols[i].replace(/"/g, '').trim().replace(',', '.');
    const n = parseFloat(raw);
    if (isFinite(n)) sum += n;
  }
  return Math.max(0, Math.min(100, sum));
}

class GpuProbe {
  constructor(intervalSeconds) {
    this.interval = Math.max(1, Number(intervalSeconds) || 2);
    this.proc = null;
    this.buf = '';
    this.pct = null;
    this.ts = 0;
    this.state = 'starting';
  }

  _ingest(line) {
    const v = parseCsvLine(line);
    if (v === null) return;
    this.pct = v;
    this.ts = Date.now();
    this.state = 'ok';
  }

  start() {
    if (this.proc) return;
    this.state = 'starting';
    let p;
    try {
      p = cp.spawn('typeperf', [COUNTER, '-si', String(this.interval)], {
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
    if (p) { try { p.kill(); } catch (_) { } }
  }

  restart() {
    this.stop();
    this.start();
  }

  snapshot() {
    return { pct: this.pct, ts: this.ts, state: this.state };
  }
}

module.exports = { parseCsvLine, GpuProbe, COUNTER };
