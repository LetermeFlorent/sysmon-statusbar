const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const DRM_ROOT = '/sys/class/drm';
const DISKSTATS_PATH = '/proc/diskstats';

function isWholeDisk(name) {
  // Disques physiques entiers uniquement : sda, nvme0n1, vda, mmcblk0. Jamais
  // une partition (sda1, nvme0n1p1) ni un device virtuel (loop0, dm-0, ram0).
  return /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/.test(name);
}

function parseDiskStats(text) {
  const devices = {};
  for (const line of String(text || '').split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 14) continue;
    const name = cols[2];
    if (!isWholeDisk(name)) continue;
    // Champ 13 (index 0 apres le nom : 10) = ms passees a faire des E/S,
    // c'est ce dont iostat tire son %util.
    const ms = Number(cols[12]);
    if (isFinite(ms)) devices[name] = ms;
  }
  return devices;
}

function diskPercent(prev, prevTs, cur, curTs) {
  const dtWall = curTs - prevTs;
  if (dtWall <= 0) return null;
  let max = null;
  for (const name in cur) {
    if (!(name in prev)) continue;
    const dMs = cur[name] - prev[name];
    if (dMs < 0) continue;
    const pct = dMs / dtWall * 100;
    if (max === null || pct > max) max = pct;
  }
  if (max === null) return null;
  return Math.max(0, Math.min(100, max));
}

function readDiskStats() {
  return parseDiskStats(fs.readFileSync(DISKSTATS_PATH, 'utf8'));
}

function findGpuSysfsPaths() {
  let cards;
  try { cards = fs.readdirSync(DRM_ROOT); } catch (_) { return []; }
  const paths = [];
  for (const name of cards) {
    if (!/^card\d+$/.test(name)) continue;
    const p = path.join(DRM_ROOT, name, 'device', 'gpu_busy_percent');
    try { fs.accessSync(p, fs.constants.R_OK); paths.push(p); } catch (_) { /* pas expose sur ce kernel/vendor */ }
  }
  return paths;
}

function readGpuSysfs(paths) {
  let sum = 0, any = false;
  for (const p of paths) {
    try {
      const n = Number(fs.readFileSync(p, 'utf8').trim());
      if (isFinite(n)) { sum += n; any = true; }
    } catch (_) { /* carte suspendue ou debranchee depuis la detection */ }
  }
  return any ? Math.max(0, Math.min(100, sum)) : null;
}

function hasNvidiaSmi() {
  try {
    cp.execFileSync('nvidia-smi', ['-L'], { timeout: 3000, stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (_) { return false; }
}

function parseNvidiaSmiOutput(text) {
  let sum = 0, any = false;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    // Number('') vaut 0, donc une ligne vide compterait comme une lecture
    // valide sans ce garde-fou explicite.
    if (!line) continue;
    const n = Number(line);
    if (isFinite(n)) { sum += n; any = true; }
  }
  return any ? Math.max(0, Math.min(100, sum)) : null;
}

function queryNvidiaSmi(cb) {
  cp.execFile('nvidia-smi',
    ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'],
    { timeout: 3000 },
    (err, stdout) => cb(err ? null : parseNvidiaSmiOutput(stdout)));
}

class LinuxProbe {
  constructor(intervalSeconds) {
    this.interval = Math.max(1, Number(intervalSeconds) || 2);
    this.timer = null;
    this.gpu = null;
    this.disk = null;
    this.ts = 0;
    this.state = 'starting';
    this.gpuMethod = null;
    this.gpuPaths = [];
    this.prevDisk = null;
    this.prevDiskTs = 0;
    this.querying = false;
    this.missing = false;
  }

  _detect() {
    this.gpuPaths = findGpuSysfsPaths();
    this.gpuMethod = this.gpuPaths.length ? 'sysfs' : (hasNvidiaSmi() ? 'nvidia' : null);
    let diskAvailable = true;
    try { readDiskStats(); } catch (_) { diskAvailable = false; }
    this.missing = !diskAvailable && this.gpuMethod === null;
  }

  _tick() {
    let diskOk = false;
    try {
      const cur = readDiskStats();
      const curTs = Date.now();
      if (this.prevDisk) {
        const pct = diskPercent(this.prevDisk, this.prevDiskTs, cur, curTs);
        if (pct !== null) { this.disk = pct; diskOk = true; }
      }
      this.prevDisk = cur;
      this.prevDiskTs = curTs;
    } catch (_) { /* /proc/diskstats absent sur cette plateforme */ }

    let gpuOk = false;
    if (this.gpuMethod === 'sysfs') {
      const v = readGpuSysfs(this.gpuPaths);
      if (v !== null) { this.gpu = v; gpuOk = true; }
    } else if (this.gpuMethod === 'nvidia' && !this.querying) {
      this.querying = true;
      queryNvidiaSmi((v) => {
        this.querying = false;
        if (v !== null) { this.gpu = v; this.ts = Date.now(); if (!this.missing) this.state = 'ok'; }
      });
    }

    this.ts = Date.now();
    if (this.missing) { this.state = 'missing'; return; }
    if (diskOk || gpuOk) this.state = 'ok';
  }

  start() {
    if (this.timer) return;
    this.state = 'starting';
    this._detect();
    this._tick();
    this.timer = setInterval(() => this._tick(), this.interval * 1000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.prevDisk = null;
  }

  restart() { this.stop(); this.start(); }

  snapshot() { return { gpu: this.gpu, disk: this.disk, ts: this.ts, state: this.state }; }
}

module.exports = {
  isWholeDisk, parseDiskStats, diskPercent, readDiskStats,
  findGpuSysfsPaths, readGpuSysfs, hasNvidiaSmi, parseNvidiaSmiOutput, queryNvidiaSmi,
  LinuxProbe
};
