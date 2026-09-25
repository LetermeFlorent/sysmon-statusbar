const cp = require('node:child_process');
const c = require('./windows-counters');

class Probe {
  constructor(intervalSeconds) {
    this.interval = Math.max(1, Number(intervalSeconds) || 2);
    this.proc = null;
    this.buf = '';
    this.kinds = null;
    this.gpu = null;
    this.gpus = {};
    this.disk = null;
    this.disks = {};
    this.swap = null;
    this.ts = 0;
    this.state = 'starting';
  }

  _ingest(line) {
    if (!this.kinds) {
      const h = c.parseHeader(line);
      if (h) { this.kinds = h; return; }
    }
    const v = c.parseValues(line, this.kinds);
    if (!v) return;
    if (v.gpu !== null) { this.gpu = v.gpu; this.gpus = v.gpus; }
    if (v.disk !== null) this.disk = v.disk;
    if (v.disks) this.disks = v.disks;
    if (v.swap !== null) this.swap = v.swap;
    this.ts = Date.now();
    this.state = 'ok';
  }

  start() {
    if (this.proc) return;
    this.state = 'starting';
    this.kinds = null;
    let p;
    try {
      p = cp.spawn('typeperf', c.COUNTERS.concat(['-si', String(this.interval)]), {
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
    return {
      gpu: this.gpu, gpus: this.gpus, disk: this.disk, disks: this.disks,
      swap: this.swap, ts: this.ts, state: this.state
    };
  }
}

module.exports = Object.assign({ Probe }, c);
